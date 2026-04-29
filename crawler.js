const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

let startUrl = "";
try {
    startUrl = fs.readFileSync('start.txt', 'utf8').trim();
} catch (err) {
    console.log("⚠️ [LỖI] Hãy tạo file start.txt và dán link vào!");
    process.exit(1);
}

(async () => {
    console.log(`🚀 Robot V8.1 (Stealth + Fixed) đang xuất kích...`);

    const browser = await puppeteer.launch({ 
        headless: true, // Đổi từ false thành true để chạy ẩn trình duyệt
        defaultViewport: { width: 1280, height: 720 },
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--autoplay-policy=no-user-gesture-required',
            '--disable-web-security',
            '--window-size=1280,720'
        ]
    });
    
    // GIAI ĐOẠN 1: GOM DANH SÁCH TẬP
    const setupPage = await browser.newPage();
    await setupPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`🔍 Đang quét danh sách tập...`);
    try {
        await setupPage.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const urlObj = new URL(startUrl);
        const basePath = urlObj.pathname.split('/').slice(0, -1).join('/'); 

        const allLinks = await setupPage.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href));
        
        let parsedLinks = [];
        let seen = new Set();
        allLinks.forEach(link => {
            if (link.includes(basePath) && !link.includes('#')) {
                if (!seen.has(link)) {
                    seen.add(link);
                    const match = link.match(/tap-(\d+)/i);
                    parsedLinks.push({ url: link, num: match ? parseInt(match[1]) : 0 });
                }
            }
        });
        parsedLinks.sort((a, b) => a.num - b.num);
        const startIndex = parsedLinks.findIndex(item => item.url === startUrl);
        var pendingUrls = startIndex !== -1 ? parsedLinks.slice(startIndex).map(item => item.url) : [startUrl];
        
        console.log(`✅ Sẽ quét ${pendingUrls.length} tập. Đang chạy chế độ Stealth...`);
    } catch (e) {
        console.log("❌ Lỗi khi lấy danh sách tập: " + e.message);
        await browser.close();
        process.exit(1);
    } finally {
        await setupPage.close();
    }

    // GIAI ĐOẠN 2: CÀO LINK VIDEO
    for (let i = 0; i < pendingUrls.length; i++) {
        const currentUrl = pendingUrls[i];
        console.log(`\n▶️ [${i + 1}/${pendingUrls.length}] Đang chộp: ${currentUrl}`);
        
        const page = await browser.newPage();
        
        // --- QUAN TRỌNG: BẬT INTERCEPTION NGAY KHI MỞ TAB MỚI ---
        await page.setRequestInterception(true);
        
        let foundUrl = null;

        page.on('request', request => {
            const url = request.url().toLowerCase();
            // Bắt link Google Drive API hoặc file media
            if (url.includes('googleapis.com/drive') || url.includes('.mp4') || url.includes('.m3u8')) {
                if (!foundUrl) {
                    foundUrl = request.url();
                    console.log(`  => 🎯 TÚM ĐƯỢC LINK VIDEO!`);
                }
            }
            request.continue(); // Cho phép request tiếp tục chạy
        });

        page.on('popup', async popup => {
            await popup.close().catch(() => {});
        });

        try {
            await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000));
            
            // Tìm và Click vào Video Player
            await page.evaluate(() => {
                const player = document.querySelector('iframe') || document.querySelector('video');
                if (player) player.scrollIntoView({ block: 'center' });
            });
            
            await page.mouse.click(640, 360);
            
            // Chờ video xuất hiện luồng tải
            let waitTime = 0;
            while (waitTime < 12000 && !foundUrl) {
                await new Promise(r => setTimeout(r, 1000));
                waitTime += 1000;
            }

            if (foundUrl) {
                fs.appendFileSync('results.txt', `${foundUrl}\n`);
                console.log(`  [THÀNH CÔNG] Đã lưu link.`);
            } else {
                console.log(`  [THẤT BẠI] Không thấy video.`);
                fs.appendFileSync('results.txt', `[LỖI] ${currentUrl}\n`);
            }

        } catch (err) {
            console.log(`  [LỖI] ${err.message}`);
        } finally {
            await page.close().catch(() => {});
            
            // Nghỉ giải lao ngẫu nhiên để Google không nghi ngờ
            const delay = Math.floor(Math.random() * 4000) + 4000;
            console.log(`  ☕ Nghỉ ${delay/1000}s...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    console.log("\n🎉 HOÀN THÀNH CHIẾN DỊCH!");
    await browser.close();
})();