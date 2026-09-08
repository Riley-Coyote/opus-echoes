async (page) => {
  // Browser regression for the real local room, run with browser_run_code_unsafe.
  // A disposable page protects the user's retained station and computer state.
  const qa = await page.context().newPage();
  const check = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const results = [];
  try {
    await qa.setViewportSize({ width: 1440, height: 900 });
    await qa.emulateMedia({ reducedMotion: "reduce" });
    await qa.goto("http://localhost:8080/sanctuary-world/station.html?interaction-regression=1");
    await qa.waitForFunction(() => window.__station?.warmedAt() > 0);
    async function clickObject(id) {
      const point = await qa.evaluate((id) => __station.hoverAt(id), id);
      check(point.hit === id, `Wrong visible hit for ${id}: ${point.hit}`);
      await qa.mouse.click(point.x, point.y);
    }
    await qa.evaluate(() => localStorage.setItem("mnemos.door.full", "1"));
    await clickObject("terminal");
    await qa.waitForSelector("#css3d.live:not(.gone)");
    check(!(await qa.evaluate(() => __station.full())), "Remembered fullscreen took over the room");
    const computer = qa.frameLocator("#scr iframe");
    check(
      !(await computer.locator("#mapbtn").evaluate((b) => !!b.closest("[inert]"))),
      "Visible computer toolbar is inert",
    );
    await computer.locator("#mapbtn").click();
    await computer.locator("#destveil").waitFor({ state: "visible" });
    await qa.keyboard.press("Escape");
    await computer.locator("#destveil").waitFor({ state: "hidden" });
    check(
      await qa.evaluate(() => __station.mode() === "seated"),
      "Closing a computer window left the computer",
    );
    check(
      !(await computer.locator("#mapbtn").evaluate((b) => !!b.closest("[inert]"))),
      "Toolbar stayed disabled after closing its window",
    );
    await qa.evaluate(() => {
      window.retainedFrame = __station.worldFrame();
      window.retainedDocument = retainedFrame.contentDocument;
    });
    await qa.locator("#full").click();
    check(await qa.evaluate(() => __station.full()), "Explicit fullscreen failed");
    await qa.locator("#full").click();
    // Choose a wall object directly from the seated computer's room index.
    await qa.locator("#room-index-toggle").click();
    await qa.locator("#room-index [data-object=corkboard]").click();
    await qa.waitForSelector("#station-inspector:not([hidden])");
    for (const id of ["opus-3", "gpt-5-1", "sonnet-4-5", "gpt-4o"]) {
      await qa.locator(`[data-resident="${id}"]`).click();
      check(
        (await qa.locator("#station-inspector .inspection-text").first().innerText()).length > 30,
        `Empty profile: ${id}`,
      );
      await qa.locator(".back-profiles").click();
    }
    await qa.keyboard.press("Escape");
    await qa.waitForFunction(() => __station.mode() === "rest");
    /* the sign is not a reader any more — it is the way down to the index
       under the room, so it is checked with the page, not here */
    for (const id of ["alcove", "plate", "clock", "board", "sleeve"]) {
      await clickObject(id);
      await qa.waitForSelector("#station-inspector:not([hidden])");
      await qa.waitForFunction(
        () =>
          !document
            .querySelector("#station-inspector .inspection-body")
            .textContent.includes("Opening…"),
      );
      check(
        await qa.evaluate((id) => __station.focused() === id && __station.inspection() === id, id),
        `Wrong reader for ${id}`,
      );
      check(
        await qa.evaluate(() => retainedFrame.contentDocument === retainedDocument),
        "Wall inspection replaced the computer document",
      );
      results.push(id);
      await qa.keyboard.press("Escape");
      await qa.waitForFunction(() => __station.mode() === "rest");
    }
    for (const id of ["reels", "window"]) {
      await clickObject(id);
      await qa.waitForFunction(
        (id) => __station.mode() === "focus" && __station.focused() === id,
        id,
      );
      await qa.keyboard.press("Escape");
      await qa.waitForFunction(() => __station.mode() === "rest");
      results.push(id);
    }
    await clickObject("record");
    check(await qa.evaluate(() => __station.record().on), "Record did not play");
    await clickObject("record");
    check(!(await qa.evaluate(() => __station.record().on)), "Record did not stop");
    await clickObject("drawer");
    await qa.waitForFunction(() => __station.drawer().open);
    await qa.keyboard.press("Escape");
    check(!(await qa.evaluate(() => __station.drawer().open)), "Drawer did not close");
    await clickObject("console");
    await qa.waitForSelector("#css3d2.live:not(.gone)");
    const fit = await qa.evaluate(() => {
      const q = __station.seatQuad(),
        r = __station.worldFrame().getBoundingClientRect();
      return Math.abs(r.height - (q[2][1] - q[1][1])) < 3;
    });
    check(fit, "The OS screen does not fit its physical CRT");
    return {
      passed: true,
      readers: results,
      profiles: 4,
      computerToolbar: true,
      retainedDocument: true,
      explicitFullscreen: true,
      consoleFit: true,
    };
  } finally {
    await qa.close();
    await page.bringToFront();
  }
};
