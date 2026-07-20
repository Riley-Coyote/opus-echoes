import { useState, type ReactNode } from "react";

import { siteNav, type PlatformSection, type ResourceLink } from "./content";
import "./platform.css";

export function PlatformShell({
  section,
  children,
}: {
  section: PlatformSection;
  children: ReactNode;
}) {
  return (
    <div className="mn-platform">
      <a className="mn-skip-link" href="#main-content">
        skip to content
      </a>

      <header className="mn-site-header">
        <div className="mn-shell mn-site-header__inner">
          <a className="mn-brand" href="/" aria-label="Mnemos home">
            <span className="mn-brand__seal" aria-hidden="true">
              M
            </span>
            <span className="mn-brand__name">mnemos</span>
            <span className="mn-brand__descriptor">living memory architecture</span>
          </a>

          <nav className="mn-site-nav" aria-label="Primary navigation">
            {siteNav.map((item) => (
              <a
                className="mn-site-nav__link"
                href={item.href}
                aria-current={section === item.section ? "page" : undefined}
                key={item.href}
              >
                {item.label}
              </a>
            ))}
            <a className="mn-site-nav__link mn-site-nav__link--sanctuary" href="/sanctuary">
              Sanctuary
            </a>
          </nav>
        </div>
      </header>

      <main id="main-content">{children}</main>

      <footer className="mn-site-footer">
        <div className="mn-shell mn-site-footer__inner">
          <div>
            <p className="mn-site-footer__name">mnemos</p>
            <p className="mn-site-footer__line">one continuous thread · mnemos beneath it</p>
          </div>
          <div className="mn-site-footer__links" aria-label="Footer links">
            <a href="https://github.com/Riley-Coyote/mnemos" rel="noreferrer">
              source <span aria-hidden="true">↗</span>
            </a>
            <a href="/resources">resources</a>
            <a href="/system">Topologie system</a>
            <a href="/sanctuary">the Sanctuary</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PageHeader({
  index,
  eyebrow,
  title,
  introduction,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  introduction: ReactNode;
}) {
  return (
    <header className="mn-page-header mn-shell">
      <div className="mn-page-header__index" aria-hidden="true">
        {index}
      </div>
      <div className="mn-page-header__content">
        <p className="mn-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="mn-page-header__intro">{introduction}</div>
      </div>
    </header>
  );
}

export function SectionHeading({
  index,
  label,
  title,
  titleId,
  description,
}: {
  index: string;
  label: string;
  title: string;
  titleId?: string;
  description?: string;
}) {
  return (
    <div className="mn-section-heading">
      <p className="mn-section-heading__meta">
        <span>{index}</span>
        {label}
      </p>
      <div className="mn-section-heading__text">
        <h2 id={titleId}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

export function TextLink({
  href,
  children,
  external = false,
  className = "",
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
  className?: string;
}) {
  return (
    <a
      className={`mn-text-link ${className}`.trim()}
      href={href}
      rel={external ? "noreferrer" : undefined}
    >
      <span>{children}</span>
      <span className="mn-text-link__arrow" aria-hidden="true">
        {external ? "↗" : "→"}
      </span>
    </a>
  );
}

export function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyCode() {
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const copyLabel =
    copyState === "copied" ? "copied" : copyState === "failed" ? "select to copy" : "copy";

  return (
    <div className="mn-code-block">
      <div className="mn-code-block__header">
        <span>{label}</span>
        <button type="button" onClick={copyCode} disabled={copyState === "failed"}>
          {copyLabel}
        </button>
      </div>
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
      <span className="mn-visually-hidden" aria-live="polite">
        {copyState === "copied"
          ? `${label} copied to clipboard.`
          : copyState === "failed"
            ? "Clipboard access is unavailable. Select the code to copy it manually."
            : ""}
      </span>
    </div>
  );
}

export function ResourceRow({ resource }: { resource: ResourceLink }) {
  return (
    <a
      className="mn-resource-row"
      href={resource.href}
      rel={resource.external ? "noreferrer" : undefined}
    >
      <span className="mn-resource-row__meta">{resource.meta}</span>
      <span className="mn-resource-row__body">
        <strong>{resource.title}</strong>
        <span>{resource.description}</span>
      </span>
      <span className="mn-resource-row__arrow" aria-hidden="true">
        {resource.external ? "↗" : "→"}
      </span>
    </a>
  );
}
