const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// === CẤU HÌNH ===
const CONCURRENCY_LIMIT = 3; // Số luồng chạy cùng lúc
const MAX_RETRIES = 3;       // Số lần thử lại tối đa nếu thất bại
let startUrl = "";

try {
    startUrl = fs.readFileSync('start.txt', 'utf8').trim();
} catch (err) {
    console.log("⚠️ [LỖI] Hãy tạo file start.txt và dán link vào!");
    process.exit(1);
}

(async () => {
    console.log(`🚀 Robot V9.1 (Đa luồng + Auto-Retry + Auto-Sort) đang xuất kích...`);

    const browser = await puppeteer.launch({ 
        headless: true,
        defaultViewport: { width: 1280, height: 720 },
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    
    // --- GIAI ĐOẠN 1: LẤY DANH SÁCH TẬP ---
    const setupPage = await browser.newPage();
    await setupPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`🔍 Đang quét danh sách tập...`);
    let pendingUrls = [];
    try {
        await setupPage.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
        const urlObj = new URL(startUrl);
        const basePath = urlObj.pathname.split('/').slice(0, -1).join('/'); 

        const allLinks = await setupPage.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href));
        
        let parsedLinks = [];
        let seen = new Set();
        
        allLinks.forEach(link => {
            if (link.includes(basePath) && !link.includes('#') && link.includes('sv-0')) {
                if (!seen.has(link)) {
                    seen.add(link);
                    const match = link.match(/tap-(\d+)/i);
                    // Lưu luôn số tập (num) để lát nữa sắp xếp
                    parsedLinks.push({ url: link, num: match ? parseInt(match[1]) : 0 });
                }
            }
        });

        parsedLinks.sort((a, b) => a.num - b.num);
        const startIndex = parsedLinks.findIndex(item => item.url === startUrl);
        pendingUrls = startIndex !== -1 ? parsedLinks.slice(startIndex) : parsedLinks;
        
        console.log(`✅ Đã lọc xong! Sẽ cào ${pendingUrls.length} tập.`);
    } catch (e) {
        console.log("❌ Lỗi khi lấy danh sách tập: " + e.message);
        await browser.close();
        process.exit(1);
    } finally {
        await setupPage.close();
    }

    // --- GIAI ĐOẠN 2: CÀO ĐA LUỒNG & AUTO-RETRY ---
    let finalResults = []; // Mảng chứa kết quả để sắp xếp cuối cùng
    const total = pendingUrls.length;

    const crawlTask = async (taskData) => {
        let foundUrl = null;
        let attempt = 0;

        // Vòng lặp Retry
        while (attempt < MAX_RETRIES && !foundUrl) {
            attempt++;
            const page = await browser.newPage();
            
            await page.setRequestInterception(true);
            page.on('request', req => {
                const type = req.resourceType();
                const reqUrl = req.url().toLowerCase();
                
                if (['image', 'stylesheet', 'font'].includes(type)) {
                    req.abort();
                } else {
                    if (reqUrl.includes('googleapis.com/drive') || reqUrl.includes('.mp4') || reqUrl.includes('.m3u8')) {
                        if (!foundUrl) {
                            foundUrl = req.url();
                            console.log(`  [Tập ${taskData.num}] 🎯 ĐÃ TÚM ĐƯỢC LINK! (Lần thử ${attempt})`);
                        }
                    }
                    req.continue();
                }
            });

            try {
                await page.goto(taskData.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
                
                await page.evaluate(() => {
                    const player = document.querySelector('iframe') || document.querySelector('video');
                    if (player) player.scrollIntoView({ block: 'center' });
                });
                await page.mouse.click(640, 360);

                let waitTime = 0;
                while (waitTime < 10000 && !foundUrl) {
                    await new Promise(r => setTimeout(r, 500));
                    waitTime += 500;
                }

                if (!foundUrl && attempt < MAX_RETRIES) {
                    console.log(`  [Tập ${taskData.num}] ❌ Hụt link. 🔄 Đang thử lại lần ${attempt + 1}...`);
                }

            } catch (err) {
                if (attempt < MAX_RETRIES) {
                    console.log(`  [Tập ${taskData.num}] ⚠️ Lỗi load trang. 🔄 Đang thử lại lần ${attempt + 1}...`);
                }
            } finally {
                await page.close();
            }
        }

        // Sau khi thử hết số lần, ghi nhận kết quả vào mảng
        if (foundUrl) {
            finalResults.push({ num: taskData.num, link: foundUrl });
        } else {
            console.log(`  [Tập ${taskData.num}] 💥 Bó tay sau ${MAX_RETRIES} lần thử! Bỏ qua.`);
            finalResults.push({ num: taskData.num, link: `[LỖI KHÔNG BẮT ĐƯỢC] ${taskData.url}` });
        }
    };

    const runWorker = async () => {
        while (pendingUrls.length > 0) {
            const taskData = pendingUrls.shift(); 
            await crawlTask(taskData);
        }
    };

    console.log(`🚀 Bắt đầu chạy ${CONCURRENCY_LIMIT} luồng song song...`);
    const workers = [];
    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
        await new Promise(r => setTimeout(r, i * 2000)); 
        workers.push(runWorker());
    }

    // Chờ toàn bộ luồng cào xong
    await Promise.all(workers);

    // --- GIAI ĐOẠN 3: SẮP XẾP VÀ XUẤT FILE ---
    console.log("\n🧹 Đang sắp xếp thứ tự các tập...");
    finalResults.sort((a, b) => a.num - b.num); // Sắp xếp lại mảng theo số tập
    
    // Ghi toàn bộ kết quả đã sắp xếp vào file
    const outputData = finalResults.map(item => item.link).join('\n');
    fs.writeFileSync('results.txt', outputData + '\n');

    console.log("🎉 HOÀN THÀNH CHIẾN DỊCH! File results.txt đã được sắp xếp gọn gàng.");
    await browser.close();
})();