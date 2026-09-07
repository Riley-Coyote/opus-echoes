async (page) => {
  // Run with browser_run_code_unsafe. A separate QA page protects open work.
  const qa = await page.context().newPage();
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const warnings = [];
  qa.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  try {
    await qa.setViewportSize({ width: 1440, height: 900 });
    await qa.goto("http://localhost:8080/sanctuary-world/station.html?journey-regression=1");
    await qa.waitForFunction(() => window.__station);
    await qa.evaluate(() => __station.sitDown("terminal"));
    await qa.waitForFunction(
      () =>
        __station.mode() === "seated" &&
        __station.worldFrame()?.contentWindow?.location.href.includes("index.html"),
    );
    await qa.evaluate(() => {
      const frame = __station.worldFrame();
      window.__retention = {
        primary: frame,
        primaryDocument: frame.contentDocument,
        primaryTime: frame.contentWindow.performance.timeOrigin,
        registry: JSON.stringify(__station.registry()),
      };
      __station.standUp();
    });
    await qa.waitForFunction(() => __station.mode() === "rest");
    await qa.evaluate(() => __station.sitDown("console"));
    await qa.waitForFunction(
      () =>
        __station.os() &&
        __station.mode() === "seated" &&
        document.querySelector("#css3d2.live:not(.gone)"),
    );
    await qa.evaluate(() => {
      const frame = __station.worldFrame();
      Object.assign(__retention, {
        secondary: frame,
        secondaryDocument: frame.contentDocument,
        secondaryTime: frame.contentWindow.performance.timeOrigin,
      });
      __station.os().open("terminal");
      __station.toggleFull();
    });
    const os = qa.frames().find((frame) => frame.url().includes("/os/"));
    await os
      .getByRole("textbox", { name: "terminal input", exact: true })
      .fill("Retain this unsent draft.");
    const cycles = [];
    for (let i = 0; i < 5; i++) {
      await qa.evaluate(() => {
        __station.museumOpen(true);
      });
      await qa.waitForFunction(() => __station.journey().phase === "away");
      const museum = qa.frames().find((frame) => frame.url().includes("/aperture/"));
      await museum.locator("#collection").click();
      await museum.waitForFunction(
        () => document.querySelector("dialog[open]")?.dataset.imageState === "ready",
      );
      assert(
        (await museum.locator("#work-results").innerText()).startsWith("11 works"),
        "Expected the Sun chamber collection",
      );
      await museum.locator("#work-search").fill("river");
      assert(
        (await museum.locator("#work-results").innerText()) === "1 of 11 works",
        "Search must respect room scope",
      );
      await museum.locator("#work-search").fill("");
      await qa.keyboard.press("Escape");
      assert(
        (await museum.locator("dialog[open]").count()) === 0,
        "Escape must close only the viewer",
      );
      assert(
        (await qa.locator("#aperture-visit.active").count()) === 1,
        "Closing artwork must keep the museum open",
      );
      await qa.locator("#aperture-visit .aperture-return").click();
      await qa.waitForFunction(() => __station.journey().phase === "idle");
      const state = await qa.evaluate(() => ({
        documents:
          __retention.primary.contentDocument === __retention.primaryDocument &&
          __retention.secondary.contentDocument === __retention.secondaryDocument,
        timeOrigins:
          __retention.primary.contentWindow.performance.timeOrigin === __retention.primaryTime &&
          __retention.secondary.contentWindow.performance.timeOrigin === __retention.secondaryTime,
        registry: JSON.stringify(__station.registry()) === __retention.registry,
        draft: __retention.secondary.contentDocument.querySelector('[aria-label="terminal input"]')
          .value,
        mode: __station.mode(),
        full: __station.full(),
        activeWindow: __station.os().active(),
      }));
      assert(
        state.documents && state.timeOrigins && state.registry,
        "A retained document or original object changed",
      );
      assert(state.draft === "Retain this unsent draft.", "Unsent Terminal input changed");
      assert(
        state.mode === "seated" && state.full && state.activeWindow === "terminal",
        "The source computer view changed",
      );
      cycles.push(state);
    }
    assert(warnings.length === 0, "Unexpected browser warning: " + warnings.join("\n"));
    return { passed: true, cycles, warnings };
  } finally {
    await qa.close();
    await page.bringToFront();
  }
};
