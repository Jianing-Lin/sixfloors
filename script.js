const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('flashlightCanvas');
const canvasCtx = canvasElement.getContext('2d');
const container = document.getElementById('mainContainer');
const indicator = document.getElementById('floor-indicator');
const statusText = document.getElementById('status-text');
const progUp = document.querySelector('#nav-up .nav-progress');
const progDown = document.querySelector('#nav-down .nav-progress');

let currentX = window.innerWidth / 2;
let currentY = window.innerHeight / 2;
let currentFloorIdx = 0;

// 上下楼冷却与蓄力时间
let isCoolingDown = false;
let navDirection = null;
let navHoverTime = 0;
const TRIGGER_TIME = 2000; // 在边缘停留 2 秒上楼
const COOLDOWN_TIME = 3500; // 爬完强制休息 3.5 秒 (非常沉重)

const chars = "!@#$%^&*()_+-=<>?0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
let decodedNodes5F = new Set();
let lastTime = performance.now();

function resize() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// 保存初始的加密文本
document.querySelectorAll('.decodable').forEach(n => {
    n.setAttribute('data-original', n.innerText.trim());
});

// 画手电筒 (利用 destination-out 挖洞)
function drawFlashlight() {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 黑幕
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.96)';
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    // 挖洞露出底下的老照片
    canvasCtx.globalCompositeOperation = 'destination-out';
    const radius = 220; // 手电筒光圈大小
    const gradient = canvasCtx.createRadialGradient(currentX, currentY, 0, currentX, currentY, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    canvasCtx.fillStyle = gradient;
    canvasCtx.beginPath();
    canvasCtx.arc(currentX, currentY, radius, 0, Math.PI * 2);
    canvasCtx.fill();
    canvasCtx.restore();
}

// 核心逻辑 (直接绑定摄像头帧，杜绝卡死)
function onResults(results) {
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const indexFinger = results.multiHandLandmarks[0][8];
        const targetX = (1 - indexFinger.x) * window.innerWidth;
        const targetY = indexFinger.y * window.innerHeight;

        // 平滑移动
        currentX += (targetX - currentX) * 0.15;
        currentY += (targetY - currentY) * 0.15;

        drawFlashlight();

        // 1. 上下楼爬楼检测
        if (!isCoolingDown) {
            const inTop = currentY < 100 && currentFloorIdx < 5;
            const inBottom = currentY > window.innerHeight - 100 && currentFloorIdx > 0;

            if (inTop || inBottom) {
                const dir = inTop ? 'up' : 'down';
                if (navDirection !== dir) { navDirection = dir; navHoverTime = 0; }
                navHoverTime += dt;
                
                const progress = Math.min(1, navHoverTime / TRIGGER_TIME) * 100;
                if (dir === 'up') progUp.style.width = `${progress}%`;
                else progDown.style.width = `${progress}%`;

                if (navHoverTime >= TRIGGER_TIME) changeFloor(dir);
            } else {
                navDirection = null; navHoverTime = 0;
                progUp.style.width = '0%'; progDown.style.width = '0%';
            }
        }

        // 2. 数据点检索、乱码与解码逻辑
        const activeFloorId = `f${currentFloorIdx + 1}`;
        const nodes = document.querySelectorAll(`#${activeFloorId} .data-node`);

        nodes.forEach(node => {
            const rect = node.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dist = Math.hypot(currentX - cx, currentY - cy);

            if (dist < 220) {
                // 照亮瞬间
                node.classList.add('illuminated');
                
                // 乱码与解码
                if (node.classList.contains('decodable') && !node.classList.contains('decoded')) {
                    node.dataset.hoverTime = (parseFloat(node.dataset.hoverTime) || 0) + dt;
                    
                    // 闪烁乱码动画
                    if(Math.random() > 0.7) {
                        let len = node.getAttribute('data-original').length;
                        node.innerText = generateScrambledText(len);
                    }

                    // 停留满 1.5 秒，显示真实数据
                    if (node.dataset.hoverTime > 1500) {
                        node.classList.add('decoded');
                        node.innerText = node.getAttribute('data-secret') + " [UNLOCKED]";
                        
                        // 5F 的极简解谜
                        if (node.classList.contains('puzzle-node')) {
                            decodedNodes5F.add(node.dataset.id);
                            if(decodedNodes5F.size === 3) {
                                setTimeout(() => {
                                    document.getElementById('the-gap-result').classList.add('show');
                                }, 800);
                            }
                        }
                    }
                }
            } else {
                // 移开光圈，缓慢暗淡（依赖 CSS 的 20 秒 transition）
                node.classList.remove('illuminated');
                
                // 没解开的就复原
                if (node.classList.contains('decodable') && !node.classList.contains('decoded')) {
                    node.dataset.hoverTime = 0;
                    node.innerText = node.getAttribute('data-original');
                }
            }
        });
    }
}

// 辅助函数
function generateScrambledText(len) {
    let res = "";
    for(let i=0; i<len; i++) res += chars[Math.floor(Math.random() * chars.length)];
    return res;
}

function changeFloor(dir) {
    if (dir === 'up') currentFloorIdx++;
    if (dir === 'down') currentFloorIdx--;

    // 修改这里：反转位移计算，让视野向上升
    const offset = (5 - currentFloorIdx) * 100;
    container.style.transform = `translateY(-${offset}vh)`;
    
    indicator.textContent = `0${currentFloorIdx + 1}_LEVEL`;

    
    // 触发疲劳冷却
    isCoolingDown = true;
    navHoverTime = 0;
    progUp.style.width = '0%';
    progDown.style.width = '0%';
    statusText.style.opacity = '1';

    setTimeout(() => {
        isCoolingDown = false;
        statusText.style.opacity = '0';
    }, COOLDOWN_TIME);
}

// 启动引擎
const hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({image: videoElement}); },
    width: 1280, height: 720
});
camera.start();

window.onload = () => { 
    container.style.transform = `translateY(-500vh)`; // 初始锁定在最底层 1F
    drawFlashlight(); 
};