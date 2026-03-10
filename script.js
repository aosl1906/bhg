const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
// J=Bube, Q=Dame, K=König, A=Ass

const defaultInhaleRanks = ['J', 'Q', 'K'];
let inhaleRanks = [];

let deck = [];
let drawnCards = [];
let gameInterval = null;
let timerInterval = null;

let isPlaying = false;
let totalSeconds = 0;
let holdSeconds = 0;
let isHoldingBreath = false;
let currentBarFill = null;
let currentPhaseType = null;
let phaseSeconds = 0;
let remainingHoldSeconds = 0;

// DOM Elements
const elTotalTime = document.getElementById('totalTime');
const elHoldTime = document.getElementById('holdTime');
const elRemainingTime = document.getElementById('remainingTime');
const elBreathTimerBox = document.getElementById('breathTimerBox');
const elRemainingTimerBox = document.getElementById('remainingTimerBox');
const elStatusBanner = document.getElementById('statusBanner');
const elCardCount = document.getElementById('cardCount');
const elActiveCardContainer = document.querySelector('.active-card-container');
const elTimeline = document.getElementById('timeline');
const elBarChart = document.getElementById('barChart');

const slider = document.getElementById('intervalSlider');
const intervalValue = document.getElementById('intervalValue');
const btnShuffle = document.getElementById('btnShuffle');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const elRankSelector = document.getElementById('rankSelector');

function loadSettings() {
    const saved = localStorage.getItem('bhg_inhale_ranks');
    if (saved) {
        try {
            inhaleRanks = JSON.parse(saved);
        } catch (e) {
            inhaleRanks = [...defaultInhaleRanks];
        }
    } else {
        inhaleRanks = [...defaultInhaleRanks];
    }
}

function saveSettings() {
    localStorage.setItem('bhg_inhale_ranks', JSON.stringify(inhaleRanks));
}

function renderRankSelector() {
    elRankSelector.innerHTML = '';
    for (let rank of ranks) {
        const chip = document.createElement('div');
        chip.className = `rank-chip ${inhaleRanks.includes(rank) ? 'active' : ''}`;
        chip.textContent = rank;
        chip.addEventListener('click', () => {
            if (inhaleRanks.includes(rank)) {
                inhaleRanks = inhaleRanks.filter(r => r !== rank);
            } else {
                inhaleRanks.push(rank);
            }
            saveSettings();
            renderRankSelector();
            updateHistogram();
            resetGame(); // Re-init deck with new rules
        });
        elRankSelector.appendChild(chip);
    }
}

function choose(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let res = 1;
    for (let i = 1; i <= k; i++) {
        res = res * (n - i + 1) / i;
    }
    return Math.round(res);
}

function updateHistogram() {
    const elHistogram = document.getElementById('histogram');
    if (!elHistogram) return;

    let totalInhale = 0;
    let totalHold = 0;
    for (let suit of suits) {
        for (let rank of ranks) {
            if (inhaleRanks.includes(rank)) {
                totalInhale++;
            } else {
                totalHold++;
            }
        }
    }

    elHistogram.innerHTML = '';

    if (totalHold === 0) {
        elHistogram.innerHTML = '<p style="color:#8b949e; align-self:center; width:100%">Du musst nie die Luft anhalten!</p>';
        return;
    }

    const currentInterval = parseInt(slider.value, 10);
    const denom = choose(totalHold + totalInhale - 1, totalInhale);

    let maxProb = 0;
    const distribution = [];

    for (let k = 1; k <= totalHold; k++) {
        let prob = 0;
        if (totalInhale === 0) {
            prob = k === totalHold ? 1 : 0;
        } else {
            const num = choose(totalHold - k + totalInhale - 1, totalInhale - 1);
            prob = num / denom;
        }

        if (prob > 0.005) { // Show bars with > 0.5% chance
            distribution.push({ k, time: k * currentInterval, p: prob });
            if (prob > maxProb) maxProb = prob;
        }
    }

    const maxBarHeight = 110; // px

    distribution.forEach(item => {
        const percentStr = (item.p * 100).toFixed(1) + '%';
        const currentHeight = Math.max(2, (item.p / maxProb) * maxBarHeight);

        const col = document.createElement('div');
        col.className = 'hist-col';

        const pctLabel = document.createElement('div');
        pctLabel.className = 'hist-percent';
        pctLabel.textContent = percentStr;

        const bar = document.createElement('div');
        bar.className = 'hist-bar';
        bar.style.height = `${currentHeight}px`;

        const timeLabel = document.createElement('div');
        timeLabel.className = 'hist-label';
        timeLabel.textContent = `${item.time}s`;

        col.appendChild(pctLabel);
        col.appendChild(bar);
        col.appendChild(timeLabel);

        elHistogram.appendChild(col);
    });
}

function calcRemainingHoldSeconds() {
    // Count hold cards still in deck (not yet drawn) + current card if holding
    const interval = parseInt(slider.value, 10);
    let holdCardsLeft = deck.filter(c => c.hold).length;
    // If we are currently in a hold phase, also count the current card's remaining time
    if (isHoldingBreath) {
        const cardHoldTotal = parseInt(slider.value, 10);
        const elapsed = phaseSeconds % cardHoldTotal || phaseSeconds;
        holdCardsLeft += 1; // current card still counting
        return holdCardsLeft * interval - (phaseSeconds % interval);
    }
    return holdCardsLeft * interval;
}

function updateRemainingDisplay() {
    if (!isHoldingBreath) {
        elRemainingTimerBox.classList.remove('active');
        elRemainingTime.textContent = '--:--';
        return;
    }
    elRemainingTimerBox.classList.add('active');
    const secs = Math.max(0, remainingHoldSeconds);
    elRemainingTime.textContent = formatTime(secs);
}

function initDeck() {
    deck = [];
    for (let suit of suits) {
        for (let rank of ranks) {
            let isRed = suit === '♥' || suit === '♦';
            let hold = !(inhaleRanks.includes(rank));
            deck.push({ suit, rank, isRed, hold });
        }
    }
}

function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function updateCardDisplay(card) {
    elActiveCardContainer.innerHTML = '';

    if (!card) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'card';
        emptyCard.id = 'activeCard';
        elActiveCardContainer.appendChild(emptyCard);
        return;
    }

    const newCard = document.createElement('div');
    newCard.className = `card ${card.isRed ? 'red' : 'black'}`;
    newCard.id = 'activeCard';

    newCard.innerHTML = `
        <span class="rank">${card.rank}</span>
        <span class="suit-small">${card.suit}</span>
        <span class="center-suit">${card.suit}</span>
    `;

    elActiveCardContainer.appendChild(newCard);
    elCardCount.textContent = deck.length;
}

function addToTimeline(card) {
    const currentInterval = slider.value;
    const evt = document.createElement('div');
    evt.className = `time-event ${card.isRed ? 'red' : 'black'} ${card.hold ? 'hold-phase' : 'breathe-phase'}`;
    evt.innerHTML = `
        ${card.rank}${card.suit}
        <span class="duration">${currentInterval}s</span>
    `;
    elTimeline.appendChild(evt);
    elTimeline.scrollLeft = elTimeline.scrollWidth;
}

function createNewBar(type) {
    const row = document.createElement('div');
    row.className = 'bar-row';

    currentBarFill = document.createElement('div');
    currentBarFill.className = `bar-fill ${type}`;
    currentBarFill.style.width = `30px`;
    currentBarFill.textContent = `0s`;

    row.appendChild(currentBarFill);
    elBarChart.appendChild(row);
    setTimeout(() => {
        elBarChart.scrollTop = elBarChart.scrollHeight;
    }, 10);
}

function updateCurrentBar(seconds) {
    if (!currentBarFill) return;
    const pxPerSec = 4;
    currentBarFill.style.width = `${Math.max(seconds * pxPerSec, 30)}px`;
    currentBarFill.textContent = `${seconds}s`;

    if (elBarChart.scrollLeft < elBarChart.scrollWidth - elBarChart.clientWidth) {
        elBarChart.scrollLeft = elBarChart.scrollWidth;
    }
}

function stopGame() {
    isPlaying = false;
    clearInterval(gameInterval);
    clearInterval(timerInterval);

    btnStart.disabled = false;
    btnStop.disabled = true;
    btnShuffle.disabled = false;
    slider.disabled = false;

    elStatusBanner.textContent = "PAUSE";
    elStatusBanner.className = "status-banner";
}

function drawCard() {
    if (deck.length === 0) {
        stopGame();
        elStatusBanner.textContent = "STAPEL LEER - SPIEL BEENDET";
        elStatusBanner.className = "status-banner breathe";
        return;
    }

    const card = deck.pop();
    drawnCards.push(card);
    updateCardDisplay(card);
    addToTimeline(card);

    const phaseType = card.hold ? 'hold' : 'breathe';

    if (currentPhaseType !== phaseType) {
        currentPhaseType = phaseType;
        phaseSeconds = 0;

        if (phaseType === 'hold') {
            isHoldingBreath = true;
            holdSeconds = 0;
            remainingHoldSeconds = calcRemainingHoldSeconds();
            elBreathTimerBox.classList.add('active');
            elStatusBanner.textContent = "LUFT ANHALTEN!";
            elStatusBanner.className = "status-banner hold";
        } else {
            isHoldingBreath = false;
            holdSeconds = 0;
            elHoldTime.textContent = "00:00";
            elBreathTimerBox.classList.remove('active');
            elStatusBanner.textContent = "ATMEN!";
            elStatusBanner.className = "status-banner breathe";
        }
        updateRemainingDisplay();
        createNewBar(phaseType);
    }
}

function updateTimers() {
    totalSeconds++;
    elTotalTime.textContent = formatTime(totalSeconds);

    phaseSeconds++;

    if (isHoldingBreath) {
        holdSeconds++;
        elHoldTime.textContent = formatTime(holdSeconds);
        remainingHoldSeconds = Math.max(0, remainingHoldSeconds - 1);
        updateRemainingDisplay();
    }

    updateCurrentBar(phaseSeconds);
}

function startGame() {
    if (deck.length === 0) {
        resetGame();
    }

    isPlaying = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnShuffle.disabled = true;
    slider.disabled = true;

    if (totalSeconds === 0 && drawnCards.length === 0) {
        drawCard(); // draw first card immediately if starting from scratch
    } else {
        // If resuming from pause, just show the previous hold/breathe state
        if (drawnCards.length > 0) {
            const lastCard = drawnCards[drawnCards.length - 1];
            if (lastCard.hold) {
                elStatusBanner.textContent = "LUFT ANHALTEN!";
                elStatusBanner.className = "status-banner hold";
            } else {
                elStatusBanner.textContent = "ATMEN!";
                elStatusBanner.className = "status-banner breathe";
            }
        }
    }

    const intervalMs = parseInt(slider.value) * 1000;

    gameInterval = setInterval(() => {
        drawCard();
    }, intervalMs);

    timerInterval = setInterval(() => {
        updateTimers();
    }, 1000);
}

function resetGame() {
    stopGame();
    initDeck();
    shuffleDeck();
    drawnCards = [];
    totalSeconds = 0;
    holdSeconds = 0;
    isHoldingBreath = false;
    currentBarFill = null;
    currentPhaseType = null;
    phaseSeconds = 0;
    remainingHoldSeconds = 0;

    elTotalTime.textContent = "00:00";
    elHoldTime.textContent = "00:00";
    elRemainingTime.textContent = "--:--";
    elRemainingTimerBox.classList.remove('active');
    elTimeline.innerHTML = "";
    elBarChart.innerHTML = "";
    elCardCount.textContent = "52";

    updateCardDisplay(null);

    elStatusBanner.textContent = "DRÜCKE START";
    elStatusBanner.className = "status-banner";
    elBreathTimerBox.classList.remove('active');
}

// Event Listeners
slider.addEventListener('input', (e) => {
    intervalValue.textContent = e.target.value;
    updateHistogram();
});

btnShuffle.addEventListener('click', resetGame);
btnStart.addEventListener('click', startGame);
btnStop.addEventListener('click', stopGame);

// Initial setup
loadSettings();
renderRankSelector();
updateHistogram();
resetGame();
