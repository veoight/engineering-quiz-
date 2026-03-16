// 全局状态
let currentQuestion = 0;
let answers = {};
let questionsData = null;
let dimensionsData = null;
let majorsData = null;
let radarChart = null;

// HTML 转义函数 - 防止 XSS 攻击
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 兼容微信浏览器的 fetch 封装
function fetchData(url) {
    return new Promise((resolve, reject) => {
        // 优先使用 fetch
        if (window.fetch) {
            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('网络请求失败');
                    }
                    return response.json();
                })
                .then(resolve)
                .catch(reject);
        } else {
            // 降级使用 XMLHttpRequest
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'json';
            xhr.onload = function() {
                if (xhr.status === 200) {
                    resolve(xhr.response);
                } else {
                    reject(new Error('网络请求失败'));
                }
            };
            xhr.onerror = function() {
                reject(new Error('网络请求失败'));
            };
            xhr.send();
        }
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    renderWelcomeScreen();
});

// 加载数据 - 使用绝对路径兼容微信
async function loadData() {
    try {
        // 获取当前页面路径，构建绝对路径
        const currentPath = window.location.pathname;
        const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
        const dataUrl = window.location.origin + basePath + 'data/questions.json';

        const data = await fetchData(dataUrl);
        dimensionsData = data.dimensions;
        questionsData = data.questions;
        majorsData = data.majors;
    } catch (error) {
        console.error('加载数据失败:', error);
        // 显示友好的错误提示
        const app = document.getElementById('app');
        if (app) {
            app.innerHTML = `
                <div style="padding: 40px 20px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                    <h2>数据加载失败</h2>
                    <p style="color: #666; margin: 20px 0;">请尝试以下操作：</p>
                    <ul style="text-align: left; max-width: 300px; margin: 0 auto; color: #666;">
                        <li>检查网络连接</li>
                        <li>刷新页面重试</li>
                        <li>如果仍无法打开，请使用浏览器访问</li>
                    </ul>
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 12px 30px; background: #667eea; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">重新加载</button>
                </div>
            `;
        }
    }
}

// 渲染欢迎页面
function renderWelcomeScreen() {
    const dimensionsGrid = document.getElementById('dimensions-grid');
    dimensionsGrid.innerHTML = dimensionsData.map(dim => `
        <div class="dimension-item">
            <span class="icon">${escapeHtml(dim.icon)}</span>
            <span>${escapeHtml(dim.name)}</span>
        </div>
    `).join('');
}

// 开始测试
function startTest() {
    currentQuestion = 0;
    answers = {};
    showScreen('quiz-screen');
    showQuestion();
}

// 显示问题
function showQuestion() {
    const totalQuestions = questionsData.reduce((sum, dim) => sum + dim.questions.length, 0);
    const progressPercent = (currentQuestion / totalQuestions) * 100;

    // 更新进度条
    document.getElementById('progress-fill').style.width = `${progressPercent}%`;
    document.getElementById('progress-indicator').textContent = `${currentQuestion + 1} / ${totalQuestions}`;

    // 找到当前问题所在的维度
    let questionIndex = currentQuestion;
    let currentDimension = null;
    let currentQuestionIndex = 0;

    for (const dim of questionsData) {
        if (questionIndex < dim.questions.length) {
            currentDimension = dim;
            currentQuestionIndex = questionIndex;
            break;
        }
        questionIndex -= dim.questions.length;
    }

    if (!currentDimension) {
        showResults();
        return;
    }

    // 获取维度信息
    const dimInfo = dimensionsData.find(d => d.id === currentDimension.dimension);

    // 更新问题内容
    document.getElementById('current-part').textContent = `${dimInfo.name}`;
    document.getElementById('part-title').textContent = dimInfo.name;
    document.getElementById('question-text').textContent = currentDimension.questions[currentQuestionIndex];

    // 移除所有选项的选中状态
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
}

// 选择选项
function selectOption(score) {
    // 记录答案
    let questionIndex = currentQuestion;
    let currentDimensionId = null;
    let currentQuestionIndex = 0;

    for (const dim of questionsData) {
        if (questionIndex < dim.questions.length) {
            currentDimensionId = dim.dimension;
            currentQuestionIndex = questionIndex;
            break;
        }
        questionIndex -= dim.questions.length;
    }

    // 初始化维度分数数组
    if (!answers[currentDimensionId]) {
        answers[currentDimensionId] = [];
    }

    // 记录分数
    answers[currentDimensionId][currentQuestionIndex] = score;

    // 高亮选中的选项
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
    event.target.closest('.option-btn').classList.add('selected');

    // 延迟后显示下一题
    setTimeout(() => {
        currentQuestion++;
        showQuestion();
    }, 300);
}

// 计算各维度总分
function calculateDimensionScores() {
    const scores = {};
    dimensionsData.forEach(dim => {
        const dimAnswers = answers[dim.id];
        if (dimAnswers) {
            scores[dim.id] = dimAnswers.reduce((sum, score) => sum + score, 0);
        } else {
            scores[dim.id] = 0;
        }
    });
    return scores;
}

// 计算专业匹配度
function calculateMajorMatches(dimensionScores) {
    const matches = majorsData.map(major => {
        let totalScore = 0;
        for (const [dimId, weight] of Object.entries(major.formula)) {
            // 将分数归一化到0-1
            const normalizedScore = dimensionScores[dimId] / 25;
            totalScore += normalizedScore * weight;
        }
        return {
            ...major,
            matchScore: Math.round(totalScore * 100)
        };
    });
    return matches.sort((a, b) => b.matchScore - a.matchScore);
}

// 显示结果
function showResults() {
    showScreen('result-screen');

    const dimensionScores = calculateDimensionScores();
    const majorMatches = calculateMajorMatches(dimensionScores);

    // 渲染雷达图
    renderRadarChart(dimensionScores);

    // 渲染维度结果列表
    renderResultsList(dimensionScores);

    // 渲染推荐专业
    renderRecommendations(majorMatches);
}

// 渲染雷达图 - 兼容无 Chart.js 环境
function renderRadarChart(scores) {
    const canvas = document.getElementById('radar-chart');
    if (!canvas) return;

    // 检查 Chart.js 是否加载成功
    if (typeof Chart === 'undefined') {
        // 降级显示简单条形图
        const container = canvas.parentElement;
        container.innerHTML = dimensionsData.map(dim => {
            const score = scores[dim.id];
            const percentage = (score / 25) * 100;
            return `
                <div class="simple-bar-item">
                    <div class="simple-bar-label">${escapeHtml(dim.icon)} ${escapeHtml(dim.name)}</div>
                    <div class="simple-bar-track">
                        <div class="simple-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="simple-bar-score">${score}</div>
                </div>
            `;
        }).join('');

        // 添加样式
        if (!document.getElementById('simple-bar-style')) {
            const style = document.createElement('style');
            style.id = 'simple-bar-style';
            style.textContent = `
                .simple-bar-item { display: flex; align-items: center; margin: 10px 0; }
                .simple-bar-label { width: 80px; font-size: 12px; }
                .simple-bar-track { flex: 1; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden; margin: 0 10px; }
                .simple-bar-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); transition: width 0.5s; }
                .simple-bar-score { width: 30px; text-align: right; font-weight: bold; }
            `;
            document.head.appendChild(style);
        }
        return;
    }

    // 正常渲染 Chart.js 雷达图
    const ctx = canvas.getContext('2d');

    const data = {
        labels: dimensionsData.map(dim => dim.name),
        datasets: [{
            label: '能力评估',
            data: dimensionsData.map(dim => scores[dim.id]),
            backgroundColor: 'rgba(102, 126, 234, 0.2)',
            borderColor: 'rgba(102, 126, 234, 1)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(102, 126, 234, 1)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgba(102, 126, 234, 1)'
        }]
    };

    const config = {
        type: 'radar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 25,
                    ticks: {
                        stepSize: 5
                    },
                    pointLabels: {
                        font: {
                            size: 12
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    };

    if (radarChart) {
        radarChart.destroy();
    }

    radarChart = new Chart(ctx, config);
}

// 渲染结果列表
function renderResultsList(scores) {
    const resultsList = document.getElementById('results-list');
    resultsList.innerHTML = dimensionsData.map((dim, index) => {
        const score = scores[dim.id];
        const percentage = (score / 25) * 100;
        const desc = getDimensionDescription(dim.id, score);

        return `
            <div class="result-item" id="result-${index + 1}">
                <div class="result-header-row">
                    <span class="result-icon">${escapeHtml(dim.icon)}</span>
                    <span class="result-name">${escapeHtml(dim.name)}</span>
                    <span class="result-score">${score} / 25</span>
                </div>
                <div class="result-bar">
                    <div class="result-bar-fill" style="width: ${percentage}%"></div>
                </div>
                <p class="result-desc">${escapeHtml(desc)}</p>
            </div>
        `;
    }).join('');
}

// 获取维度描述
function getDimensionDescription(dimId, score) {
    const percentage = (score / 25) * 100;
    if (percentage >= 80) {
        return '该项能力非常突出，是你的优势领域';
    } else if (percentage >= 60) {
        return '该项能力较强，适合相关领域的发展';
    } else if (percentage >= 40) {
        return '该项能力中等，需要进一步探索';
    } else {
        return '该项能力有待提升，建议关注相关领域';
    }
}

// 渲染推荐专业
function renderRecommendations(majorMatches) {
    const container = document.getElementById('top-recommendations');
    const top3 = majorMatches.slice(0, 3);
    const ranks = ['🥇', '🥈', '🥉'];

    container.innerHTML = top3.map((major, index) => `
        <div class="recommendation-item">
            <div class="rank">${escapeHtml(ranks[index])}</div>
            <div class="major-name">${escapeHtml(major.icon)} ${escapeHtml(major.name)}</div>
            <div class="match-score">匹配度: ${major.matchScore}%</div>
            <ul class="careers">
                ${major.careers.map(career => `<li>• ${escapeHtml(career)}</li>`).join('')}
            </ul>
            <div class="companies">🏢 ${escapeHtml(major.companies)}</div>
        </div>
    `).join('');
}

// 重新测试
function restartTest() {
    currentQuestion = 0;
    answers = {};
    showScreen('welcome-screen');
}

// 下载结果 - 兼容微信
function downloadResult() {
    const dimensionScores = calculateDimensionScores();
    const majorMatches = calculateMajorMatches(dimensionScores);

    let content = '工程专业倾向评估问卷 - 测试结果\n';
    content += '========================================\n\n';

    content += '【维度得分】\n';
    dimensionsData.forEach(dim => {
        content += `${dim.icon} ${dim.name}: ${dimensionScores[dim.id]} / 25\n`;
    });

    content += '\n【专业匹配度】\n';
    majorMatches.forEach((major, index) => {
        content += `${index + 1}. ${major.name}: ${major.matchScore}%\n`;
        content += `   职业方向: ${major.careers.join(', ')}\n`;
        content += `   代表企业: ${major.companies}\n\n`;
    });

    content += '\n【建议】\n';
    content += `最高匹配专业: ${majorMatches[0].name} (${majorMatches[0].matchScore}%)\n`;
    if (majorMatches.length > 1 && (majorMatches[0].matchScore - majorMatches[1].matchScore) < 5) {
        content += `次高匹配专业: ${majorMatches[1].name} (${majorMatches[1].matchScore}%)\n`;
        content += '两个专业匹配度接近，说明你是复合型人才！\n';
    }

    content += '\n========================================\n';
    content += `测试日期: ${new Date().toLocaleString('zh-CN')}\n`;

    // 检测是否在微信环境
    const isWechat = /micromessenger/i.test(navigator.userAgent);

    if (isWechat) {
        // 微信环境下，显示内容让用户手动保存
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `
            <div style="background:white;padding:30px;border-radius:12px;max-width:90%;max-height:80%;overflow:auto;">
                <h3 style="margin-top:0;">长按下方内容复制</h3>
                <pre style="background:#f5f5f5;padding:15px;border-radius:8px;white-space:pre-wrap;font-size:12px;">${escapeHtml(content)}</pre>
                <button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:12px;background:#667eea;color:white;border:none;border-radius:8px;margin-top:15px;">关闭</button>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        // 普通浏览器，使用下载
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `工程专业倾向评估结果_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// 切换屏幕
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}
