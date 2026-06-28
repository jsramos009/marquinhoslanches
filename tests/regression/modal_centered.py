"""Regression: order modal must always open centered after route transitions,
and focus must be trapped + returned to opener on close.

Runs in CI against the built preview server. Override target with APP_URL env."""
import asyncio, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(exist_ok=True)
URL = os.environ.get("APP_URL", "http://localhost:8080").rstrip("/")
VIEWPORT = {"width": 390, "height": 800}

async def assert_modal_centered(page, label):
    info = await page.evaluate("""() => {
      const ov = document.querySelector('[role="dialog"]')?.parentElement;
      const panel = document.querySelector('[role="dialog"]');
      if (!ov || !panel) return null;
      const ovR = ov.getBoundingClientRect();
      const pR = panel.getBoundingClientRect();
      return {
        viewportH: window.innerHeight,
        viewportW: window.innerWidth,
        ov: {x: ovR.x, y: ovR.y, w: ovR.width, h: ovR.height},
        panel: {x: pR.x, y: pR.y, w: pR.width, h: pR.height},
      };
    }""")
    assert info, f"[{label}] modal not in DOM"
    vh, vw = info["viewportH"], info["viewportW"]
    # Overlay must cover the viewport exactly (fixed positioning intact)
    assert info["ov"]["y"] == 0 and info["ov"]["x"] == 0, f"[{label}] overlay not at viewport origin: {info['ov']}"
    assert abs(info["ov"]["w"] - vw) < 1 and abs(info["ov"]["h"] - vh) < 1, f"[{label}] overlay size != viewport: {info}"
    # Panel must be fully visible within viewport
    p = info["panel"]
    assert p["y"] >= 0 and p["y"] + p["h"] <= vh + 0.5, f"[{label}] panel vertically clipped: {p}, vh={vh}"
    assert p["x"] >= 0 and p["x"] + p["w"] <= vw + 0.5, f"[{label}] panel horizontally clipped: {p}, vw={vw}"
    # Panel must be roughly centered (top/bottom margins within 30% of each other)
    top_margin = p["y"]
    bottom_margin = vh - (p["y"] + p["h"])
    total_free = top_margin + bottom_margin
    if total_free > 4:  # only matters when panel is smaller than viewport
        ratio = min(top_margin, bottom_margin) / max(top_margin, bottom_margin, 1)
        assert ratio >= 0.6, f"[{label}] panel not centered: top={top_margin} bottom={bottom_margin}"
    print(f"  [OK] {label}: panel centered (top={p['y']:.0f}, bottom={vh - p['y'] - p['h']:.0f})")

async def open_first_product(page):
    # Product cards are <button> elements whose text starts with the emoji or product name.
    # Click first card that opens a dialog.
    cards = page.locator('button:has-text("Pedir")')
    n = await cards.count()
    assert n > 0, "no product cards found"
    await cards.first.scroll_into_view_if_needed()
    opener_id = await cards.first.evaluate("el => { el.setAttribute('data-opener-test', '1'); return '1'; }")
    await cards.first.click()
    await page.wait_for_selector('[role="dialog"]', timeout=3000)
    await page.wait_for_timeout(400)  # let entry animation settle

async def close_modal(page):
    await page.get_by_label("Fechar").click()
    await page.wait_for_selector('[role="dialog"]', state="detached", timeout=2000)

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport=VIEWPORT)
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # 1. Fresh load -> open modal -> centered
        await page.goto(URL, wait_until="networkidle")
        await open_first_product(page)
        await page.screenshot(path=str(SHOTS / "1_fresh.png"))
        await assert_modal_centered(page, "fresh load")
        await close_modal(page)

        # 2. After scrolling far down, modal must still be centered in viewport
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(200)
        # Scroll back a bit so a Pedir button is visible
        await page.evaluate("window.scrollTo(0, 600)")
        await page.wait_for_timeout(200)
        await open_first_product(page)
        await page.screenshot(path=str(SHOTS / "2_scrolled.png"))
        await assert_modal_centered(page, "after scroll")
        await close_modal(page)

        # 3. Simulate route transition: go to /auth then back to /, then open modal
        await page.goto(f"{URL}/auth", wait_until="domcontentloaded")
        await page.wait_for_timeout(300)
        await page.goto(URL, wait_until="networkidle")
        await page.wait_for_timeout(300)
        await open_first_product(page)
        await page.screenshot(path=str(SHOTS / "3_after_route_transition.png"))
        await assert_modal_centered(page, "after route transition")

        # 4. Focus trap: Tab should cycle inside the modal (active element stays in dialog)
        for _ in range(15):
            await page.keyboard.press("Tab")
        inside = await page.evaluate("""() => {
          const dlg = document.querySelector('[role="dialog"]');
          return !!(dlg && dlg.contains(document.activeElement));
        }""")
        assert inside, "focus escaped the modal during Tab cycling"
        print("  [OK] focus trap holds during Tab cycling")

        # Shift+Tab from first focusable should wrap to last (stays inside)
        await page.evaluate("""() => {
          const dlg = document.querySelector('[role="dialog"]');
          const f = dlg.querySelectorAll('a,button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
          f[0].focus();
        }""")
        await page.keyboard.press("Shift+Tab")
        still_inside = await page.evaluate("""() => {
          const dlg = document.querySelector('[role="dialog"]');
          return !!(dlg && dlg.contains(document.activeElement));
        }""")
        assert still_inside, "Shift+Tab from first focusable escaped the modal"
        print("  [OK] focus trap holds on Shift+Tab wrap")

        # 5. Focus return: opener gets focus back after Escape closes the modal
        # The opener was the first "Pedir" card. Mark which button was focused before opening.
        # Re-open from a known opener:
        await close_modal(page)
        opener_handle = await page.evaluate_handle("""() => {
          const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Pedir'));
          btns[0].setAttribute('data-test-opener','yes');
          btns[0].focus();
          return btns[0];
        }""")
        await page.keyboard.press("Enter")
        await page.wait_for_selector('[role="dialog"]', timeout=3000)
        await page.wait_for_timeout(300)
        await page.keyboard.press("Escape")
        await page.wait_for_selector('[role="dialog"]', state="detached", timeout=2000)
        await page.wait_for_timeout(100)
        focused_is_opener = await page.evaluate("""() => {
          return document.activeElement?.getAttribute('data-test-opener') === 'yes';
        }""")
        assert focused_is_opener, "focus did not return to opener after close"
        print("  [OK] focus returned to opener after Escape")

        if errors:
            print("PAGE ERRORS:", errors)
            sys.exit(2)

        print("\nALL REGRESSION CHECKS PASSED")
        await browser.close()

asyncio.run(main())
