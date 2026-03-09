import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        await page.goto("https://www.amazon.in/s?k=iphone+15")
        
        try:
            await page.wait_for_selector('div[data-component-type="s-search-result"]', timeout=10000)
            print("Found results!")
            html = await page.content()
            print("Length of HTML:", len(html))
        except Exception as e:
            print("Error:", e)
            await page.screenshot(path="amazon_captcha.png")
            print("Saved screenshot of what Amazon returned.")
        
        await browser.close()

asyncio.run(test())
