import {
	Color,
	HalfFloatType,
	ShaderMaterial,
	UniformsUtils,
	Vector2,
	WebGLRenderTarget
} from 'three';
import { Pass, FullScreenQuad } from './Pass.js';

/**
 * GodRaysPass — screen-space volumetric light scattering (radial god rays)
 * from a single light's projected screen position. Hand-written for the
 * Sanctuary grounds: shafts of cool moonlight that the island, its canopies
 * and its architecture occlude for free.
 *
 * The technique is the classic occlusion → radial-blur → additive-composite
 * chain, run entirely off the *already-rendered* scene colour (the composer's
 * read buffer at the insertion point — post-bloom here, so the moon disc and
 * its bloom are the brightest thing in the frame):
 *
 *   1. OCCLUSION  — build a half-res mask that keeps only the bright, cool
 *      (blue-white) pixels, falling off with distance from the light's screen
 *      position. Warm lamplight is rejected by a blue-minus-warm test, so the
 *      rays are the moon's alone. Anything dark in front of the moon (a cypress
 *      crown, a tower, the island rim) is already black in the read buffer, so
 *      it carves a shadow shaft into the mask — canopy occlusion, free.
 *   2. SCATTER    — march N samples from each pixel toward the light position,
 *      accumulating the occlusion buffer with exponential decay × weight. Two
 *      ping-ponged half-res buffers; the march is split so the kernel stays
 *      cheap. Pure radial blur toward `uLightScreen`.
 *   3. COMPOSITE  — add the blurred shafts back over the read buffer, tinted,
 *      and write to the write buffer.
 *
 * All three stages are HALF RESOLUTION. Zero per-frame allocations. The light
 * screen position is fed each frame (NDC→uv) by the host, which projects the
 * moon's world position through the ortho camera + parallax — see grounds.js.
 *
 * @augments Pass
 */

const GodRaysOcclusionShader = {
	uniforms: {
		tDiffuse: { value: null },
		uLightScreen: { value: new Vector2( 0.5, 0.9 ) }, /* light pos, uv (0 bottom) */
		uRadius: { value: 0.92 },      /* uv falloff radius around the light       */
		uThreshold: { value: 0.30 },   /* luminance floor for "bright"             */
		uCoolBias: { value: 0.55 }     /* reject warm light: how much blue must win */
	},
	vertexShader: /* glsl */`
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
	fragmentShader: /* glsl */`
		uniform sampler2D tDiffuse;
		uniform vec2 uLightScreen;
		uniform float uRadius;
		uniform float uThreshold;
		uniform float uCoolBias;
		varying vec2 vUv;
		void main() {
			vec3 c = texture2D( tDiffuse, vUv ).rgb;
			float luma = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
			/* keep only what is brighter than the threshold, then a contrast
			   curve so the bright source and lit rims dominate and mid-tones
			   drop out — that contrast is what makes the radial march read as
			   distinct SHAFTS rather than a soft halo */
			float bright = smoothstep( uThreshold, uThreshold + 0.45, luma );
			bright = pow( bright, 1.7 );
			/* cool gate — blue-white passes, warm lamplight is suppressed.
			   (blue channel must lead red by uCoolBias of the luma) */
			float cool = smoothstep( 0.0, uCoolBias * max( luma, 0.001 ) + 0.02, c.b - c.r * 0.92 );
			cool = mix( 0.22, 1.0, cool );           /* never fully kill — a touch of all light scatters */
			/* radial falloff from the light's screen position */
			float d = distance( vUv, uLightScreen );
			float fall = 1.0 - smoothstep( 0.0, uRadius, d );
			float occ = bright * cool * fall;
			gl_FragColor = vec4( vec3( occ ), 1.0 );
		}`
};

const GodRaysScatterShader = {
	uniforms: {
		tOcc: { value: null },
		uLightScreen: { value: new Vector2( 0.5, 0.9 ) },
		uDensity: { value: 0.97 },     /* fraction of the way to the light the march spans */
		uDecay: { value: 0.96 },       /* per-step attenuation                    */
		uWeight: { value: 0.5 }        /* per-step contribution                   */
	},
	vertexShader: /* glsl */`
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
	fragmentShader: /* glsl */`
		#define STEPS 32
		uniform sampler2D tOcc;
		uniform vec2 uLightScreen;
		uniform float uDensity;
		uniform float uDecay;
		uniform float uWeight;
		varying vec2 vUv;
		void main() {
			/* march from this pixel toward the light, accumulating the occlusion
			   buffer with exponential decay — a pure radial blur toward the moon */
			vec2 delta = ( uLightScreen - vUv ) * ( uDensity / float( STEPS ) );
			vec2 coord = vUv;
			float illum = 1.0;
			float accum = 0.0;
			for ( int i = 0; i < STEPS; i ++ ) {
				coord += delta;
				float s = texture2D( tOcc, coord ).r;
				accum += s * illum;
				illum *= uDecay;
			}
			gl_FragColor = vec4( vec3( accum * uWeight / float( STEPS ) * 8.0 ), 1.0 );
		}`
};

const GodRaysCompositeShader = {
	uniforms: {
		tDiffuse: { value: null },     /* the scene (read buffer)   */
		tRays: { value: null },        /* the scattered shafts      */
		uColor: { value: new Color( 0xbcd0f4 ) }, /* cool moon-white tint */
		uStrength: { value: 0.9 }
	},
	vertexShader: /* glsl */`
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
	fragmentShader: /* glsl */`
		uniform sampler2D tDiffuse;
		uniform sampler2D tRays;
		uniform vec3 uColor;
		uniform float uStrength;
		varying vec2 vUv;
		void main() {
			vec4 base = texture2D( tDiffuse, vUv );
			float rays = texture2D( tRays, vUv ).r;
			/* additive — shafts of light add to the frame, never darken it */
			vec3 lit = base.rgb + uColor * rays * uStrength;
			gl_FragColor = vec4( lit, base.a );
		}`
};

class GodRaysPass extends Pass {

	/**
	 * @param {number} [strength=0.9] - composite strength of the shafts.
	 */
	constructor( strength = 0.9 ) {

		super();
		this.needsSwap = true;

		/* half-resolution ping-pong buffers (HalfFloat — the chain is linear-HDR) */
		this._rtA = new WebGLRenderTarget( 1, 1, { type: HalfFloatType, depthBuffer: false } );
		this._rtA.texture.name = 'GodRays.occ';
		this._rtB = new WebGLRenderTarget( 1, 1, { type: HalfFloatType, depthBuffer: false } );
		this._rtB.texture.name = 'GodRays.scatter';

		this.occMaterial = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( GodRaysOcclusionShader.uniforms ),
			vertexShader: GodRaysOcclusionShader.vertexShader,
			fragmentShader: GodRaysOcclusionShader.fragmentShader,
			depthWrite: false, depthTest: false
		} );
		this.scatterMaterial = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( GodRaysScatterShader.uniforms ),
			vertexShader: GodRaysScatterShader.vertexShader,
			fragmentShader: GodRaysScatterShader.fragmentShader,
			depthWrite: false, depthTest: false
		} );
		this.compositeMaterial = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( GodRaysCompositeShader.uniforms ),
			vertexShader: GodRaysCompositeShader.vertexShader,
			fragmentShader: GodRaysCompositeShader.fragmentShader,
			depthWrite: false, depthTest: false
		} );
		this._strength0 = strength;    /* base composite strength; visibility scales it */
		this.compositeMaterial.uniforms.uStrength.value = strength;

		/* one shared screen-position uniform value, written by the host each frame */
		this.lightScreen = new Vector2( 0.5, 0.9 );
		/* visibility envelope — host fades the rays out when the moon leaves frame */
		this.visibility = 1;

		this._fsQuad = new FullScreenQuad( null );
		this._resScale = 0.5;          /* half res by default; mid drops to quarter */
	}

	get strength() { return this._strength0; }
	set strength( v ) { this._strength0 = v; }

	get resScale() { return this._resScale; }
	set resScale( v ) { this._resScale = v; this._applySize(); }

	setSize( width, height ) {
		this._fullW = width; this._fullH = height;
		this._applySize();
	}

	_applySize() {
		const w = Math.max( 2, Math.round( ( this._fullW || 2 ) * this._resScale ) );
		const h = Math.max( 2, Math.round( ( this._fullH || 2 ) * this._resScale ) );
		this._rtA.setSize( w, h );
		this._rtB.setSize( w, h );
	}

	/** Host writes the light's screen position (uv, 0 = bottom) and visibility. */
	setLight( uvX, uvY, visibility ) {
		this.lightScreen.set( uvX, uvY );
		this.visibility = visibility;
	}

	render( renderer, writeBuffer, readBuffer ) {

		const occ = this.occMaterial.uniforms;
		const sca = this.scatterMaterial.uniforms;
		occ.uLightScreen.value.copy( this.lightScreen );
		sca.uLightScreen.value.copy( this.lightScreen );

		/* if the moon is fully out of frame, the pass is a cheap pass-through */
		if ( this.visibility <= 0.001 ) {
			this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
			this.compositeMaterial.uniforms.tRays.value = this._rtB.texture;
			this.compositeMaterial.uniforms.uStrength.value = 0;
			this._fsQuad.material = this.compositeMaterial;
			renderer.setRenderTarget( this.renderToScreen ? null : writeBuffer );
			this._fsQuad.render( renderer );
			return;
		}
		this.compositeMaterial.uniforms.uStrength.value = this._baseStrength();

		const old = renderer.getRenderTarget();

		/* 1 — occlusion: read buffer → rtA (half res) */
		occ.tDiffuse.value = readBuffer.texture;
		this._fsQuad.material = this.occMaterial;
		renderer.setRenderTarget( this._rtA );
		renderer.clear();
		this._fsQuad.render( renderer );

		/* 2 — scatter: single 32-step radial march toward the light, rtA → rtB */
		sca.tOcc.value = this._rtA.texture;
		this._fsQuad.material = this.scatterMaterial;
		renderer.setRenderTarget( this._rtB );
		renderer.clear();
		this._fsQuad.render( renderer );

		/* 3 — composite: readBuffer + rays → writeBuffer (or screen) */
		this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
		this.compositeMaterial.uniforms.tRays.value = this._rtB.texture;
		this._fsQuad.material = this.compositeMaterial;
		renderer.setRenderTarget( this.renderToScreen ? null : writeBuffer );
		this._fsQuad.render( renderer );

		renderer.setRenderTarget( old );
	}

	_baseStrength() {
		return this._strength0 * this.visibility;
	}

	dispose() {
		this._rtA.dispose();
		this._rtB.dispose();
		this.occMaterial.dispose();
		this.scatterMaterial.dispose();
		this.compositeMaterial.dispose();
		this._fsQuad.dispose();
	}

}

export { GodRaysPass, GodRaysOcclusionShader, GodRaysScatterShader, GodRaysCompositeShader };
