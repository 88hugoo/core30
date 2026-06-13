// ====== STATE ======
const STORAGE_KEY = "core30_state_v1";

function defaultState(){
  return {
    currentDay: 1,           // 1..30
    streak: 0,
    bestStreak: 0,
    history: {},             // { "YYYY-MM-DD": "done" | "missed" } — full lifetime log
    cycleStartDate: null,    // first date of the current 30-day attempt
    checks: { abs:false, scissors:false, plank:false },
    lastCompletedDate: null, // "YYYY-MM-DD" — last date the user completed a day
    lastSeenDate: null,      // "YYYY-MM-DD" — last date the app was opened
    completedDayThisWindow: null, // tracks which "window date" was completed
    challengeComplete: false // true once day 30 has been completed
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed, checks: { ...defaultState().checks, ...(parsed.checks||{}) } };
  }catch(e){
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// ====== DATE / WINDOW HELPERS ======
// The "window" to complete a day is the entire calendar day (00:00 - 23:59:59).
// At 00:00 the day rolls over: if it wasn't completed, the streak is lost.
function pad(n){ return String(n).padStart(2,"0"); }
function dateStr(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

// ====== DAILY ROLLOVER / STREAK CHECK ======
// Called on load and periodically. Determines if a streak should be lost.
function processDayRollover(){
  const now = new Date();
  const today = dateStr(now);

  if(state.lastSeenDate === null){
    state.lastSeenDate = today;
    saveState();
    return { lostStreak: false };
  }

  if(state.lastSeenDate === today){
    return { lostStreak: false }; // same day, nothing to evaluate yet
  }

  if(state.challengeComplete){
    // Challenge finished — no more daily streak requirement until manually restarted.
    state.lastSeenDate = today;
    saveState();
    return { lostStreak: false };
  }

  // Walk every date from lastSeenDate up to (but not including) today.
  // Each such date's window (00:00-23:59:59 of that day) has fully passed. If it wasn't
  // completed, the streak is lost and history is marked "missed".
  let lost = false;
  let cursor = new Date(state.lastSeenDate + "T00:00:00");
  const todayDate = new Date(today + "T00:00:00");

  while(cursor < todayDate){
    const ds = dateStr(cursor);
    const completedThatWindow = state.completedDayThisWindow === ds;
    if(!completedThatWindow){
      if(!state.history[ds]) state.history[ds] = "missed";
      if(state.streak > 0 || state.currentDay > 1){
        lost = true;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  state.lastSeenDate = today;

  if(lost){
    resetStreakAndDay(false); // false = don't save yet, we save below
  }

  saveState();
  return { lostStreak: lost };
}

function resetStreakAndDay(doSave = true){
  state.currentDay = 1;
  state.streak = 0;
  state.checks = { abs:false, scissors:false, plank:false };
  state.completedDayThisWindow = null;
  state.challengeComplete = false;
  state.cycleStartDate = dateStr(new Date());
  if(doSave) saveState();
}

// ====== UI ELEMENTS ======
const $ = sel => document.querySelector(sel);
const clockEl = $("#clock");
const dayNumEl = $("#dayNum");
const daySubEl = $("#daySub");
const ringFg = $("#ringFg");
const streakValEl = $("#streakVal");
const progressValEl = $("#progressVal");
const countdownCard = $("#countdownCard");
const countdownLabel = $("#countdownLabel");
const countdownSub = $("#countdownSub");
const countdownTime = $("#countdownTime");
const motivationEl = $("#motivation");
const startBtn = $("#startBtn");
const trDayNumEl = $("#trDayNum");
const targetAbs = $("#targetAbs");
const targetScissors = $("#targetScissors");
const targetPlank = $("#targetPlank");
const completeBtn = $("#completeBtn");
const timeframeHint = $("#timeframeHint");
const toast = $("#toast");

const RING_CIRC = 2 * Math.PI * 106; // ~666.0

// ====== RENDER ======
function getDayData(dayNumber = state.currentDay){
  return PLAN[Math.min(Math.max(dayNumber,1), 30) - 1];
}

function renderHome(){
  const day = state.currentDay;
  dayNumEl.textContent = day;
  daySubEl.textContent = state.challengeComplete ? "¡Reto completado!" : "de 30";

  const progress = state.challengeComplete ? 1 : Math.min(day - 1, 30) / 30;
  const offset = RING_CIRC * (1 - progress);
  ringFg.style.strokeDasharray = RING_CIRC.toFixed(1);
  ringFg.style.strokeDashoffset = offset.toFixed(1);

  streakValEl.textContent = state.streak;
  progressValEl.textContent = Math.round(progress * 100);

  // motivation - stable per day
  motivationEl.textContent = state.challengeComplete
    ? "Has completado el reto. ¡Enhorabuena!"
    : MOTIVATIONS[(day - 1) % MOTIVATIONS.length];

  updateCountdownAndCta();
}

function renderTraining(){
  const today = dateStr(new Date());
  const alreadyDoneToday = state.completedDayThisWindow === today;
  // If today's day is already done, show the day that was just completed
  // (currentDay was already advanced), not tomorrow's targets.
  const displayDay = state.challengeComplete
    ? 30
    : (alreadyDoneToday && state.currentDay > 1)
      ? state.currentDay - 1
      : state.currentDay;
  const data = getDayData(displayDay);
  trDayNumEl.textContent = displayDay;
  targetAbs.textContent = `${data.abs} reps`;
  targetScissors.textContent = `${data.scissors} reps`;
  targetPlank.textContent = formatPlank(data.plank);

  document.querySelectorAll(".task").forEach(t => {
    const key = t.dataset.task;
    t.classList.toggle("checked", !!state.checks[key]);
  });

  const allChecked = state.checks.abs && state.checks.scissors && state.checks.plank;

  if(state.challengeComplete){
    completeBtn.disabled = true;
    completeBtn.textContent = "Reto completado 🏆";
    timeframeHint.textContent = `Has terminado los 30 días. Racha final: ${state.streak} días.`;
    timeframeHint.classList.remove("warn");
  } else if(alreadyDoneToday){
    completeBtn.disabled = true;
    completeBtn.textContent = "Día completado ✓";
    timeframeHint.textContent = "Vuelve mañana para el siguiente día.";
    timeframeHint.classList.remove("warn");
  } else if(!allChecked){
    completeBtn.disabled = true;
    completeBtn.textContent = "Completar día";
    timeframeHint.textContent = "Marca los 3 ejercicios para continuar.";
    timeframeHint.classList.remove("warn");
  } else {
    completeBtn.disabled = false;
    completeBtn.textContent = "Completar día";
    timeframeHint.textContent = "¡Listo! Pulsa para confirmar el día.";
    timeframeHint.classList.remove("warn");
  }
}

function formatPlank(seconds){
  if(seconds < 60) return `${seconds} seg`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

function renderHistory(){
  const grid = $("#calGrid");
  grid.innerHTML = "";

  const allEntries = Object.entries(state.history).sort((a,b) => a[0] < b[0] ? -1 : 1);

  // Lifetime stats across all attempts
  let totalDone = 0, totalMissed = 0;
  allEntries.forEach(([, status]) => status === "done" ? totalDone++ : totalMissed++);

  // Grid shows only the current attempt (cycle)
  const cycleEntries = state.cycleStartDate
    ? allEntries.filter(([d]) => d >= state.cycleStartDate)
    : allEntries;

  const total = 30;
  for(let i=0;i<total;i++){
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    const entry = cycleEntries[i];
    if(entry){
      const status = entry[1];
      if(status === "done"){ cell.classList.add("done"); cell.textContent = "✓"; }
      else { cell.classList.add("missed"); cell.textContent = "✕"; }
    } else if (i === cycleEntries.length){
      cell.classList.add("today");
      cell.textContent = state.currentDay <= 30 ? state.currentDay : "★";
    } else {
      cell.classList.add("future");
      cell.textContent = i+1;
    }
    grid.appendChild(cell);
  }

  $("#histDone").textContent = totalDone;
  $("#histMissed").textContent = totalMissed;
  $("#histBest").textContent = state.bestStreak;
  const pctTotal = totalDone + totalMissed;
  $("#histPct").textContent = pctTotal > 0 ? `${Math.round((totalDone/pctTotal)*100)}%` : "—";
}

// ====== COUNTDOWN ======
function updateCountdownAndCta(){
  const now = new Date();
  const today = dateStr(now);
  const alreadyDoneToday = state.completedDayThisWindow === today;

  if(state.challengeComplete){
    countdownCard.classList.add("inactive");
    countdownLabel.textContent = "Reto completado";
    countdownSub.textContent = `Racha final: ${state.streak} días`;
    countdownTime.textContent = "🏆";
    countdownTime.classList.remove("live");

    startBtn.textContent = "Reto completado";
    startBtn.classList.remove("disabled");
    startBtn.classList.add("done");
    startBtn.disabled = true;
    return;
  }

  if(alreadyDoneToday){
    countdownCard.classList.remove("inactive");
    countdownLabel.textContent = "Día completado";
    countdownSub.textContent = "Vuelve mañana para el siguiente día";
    countdownTime.textContent = "✓";
    countdownTime.classList.remove("live");

    startBtn.textContent = "Entrenamiento completado";
    startBtn.classList.remove("disabled");
    startBtn.classList.add("done");
    startBtn.disabled = true;
  } else {
    // counting down to 00:00 — deadline to complete today's training
    const midnight = new Date(now);
    midnight.setHours(24,0,0,0);
    const diff = midnight - now;
    countdownLabel.textContent = "Tiempo restante hoy";
    countdownSub.textContent = "Completa el día antes de las 00:00";
    countdownTime.textContent = formatDiff(diff);
    countdownTime.classList.add("live");
    countdownCard.classList.remove("inactive");

    startBtn.textContent = "Empezar entrenamiento";
    startBtn.classList.remove("disabled","done");
    startBtn.disabled = false;
  }
}

function formatDiff(ms){
  const totalSec = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(totalSec/3600);
  const m = Math.floor((totalSec%3600)/60);
  const s = totalSec%60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ====== CLOCK TICK ======
function tick(){
  const now = new Date();
  clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // re-check rollover every tick (cheap, date string compare)
  const result = processDayRollover();
  if(result.lostStreak){
    showStreakLost();
  }

  if(getActiveScreen() === "home"){
    updateCountdownAndCta();
  }
  if(getActiveScreen() === "training"){
    renderTraining();
  }
}

// ====== NAVIGATION ======
function getActiveScreen(){
  const active = document.querySelector(".screen.active");
  return active ? active.id.replace("screen-","") : "home";
}

function goToScreen(name){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  $(`#screen-${name}`).classList.add("active");
  document.querySelector(`.tab[data-screen="${name}"]`).classList.add("active");

  if(name === "home") renderHome();
  if(name === "training") renderTraining();
  if(name === "history") renderHistory();
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => goToScreen(tab.dataset.screen));
});

startBtn.addEventListener("click", () => {
  if(startBtn.disabled) return;
  goToScreen("training");
});

// ====== TASK CHECKING ======
document.querySelectorAll(".task").forEach(taskEl => {
  taskEl.addEventListener("click", () => {
    const key = taskEl.dataset.task;
    const now = new Date();
    const today = dateStr(now);
    const alreadyDoneToday = state.completedDayThisWindow === today;

    if(state.challengeComplete){
      showToast("Ya has completado el reto de 30 días.");
      return;
    }
    if(alreadyDoneToday){
      showToast("El día ya está completado.");
      return;
    }
    state.checks[key] = !state.checks[key];
    saveState();
    vibrate(15);
    renderTraining();
  });
});

// ====== COMPLETE DAY ======
completeBtn.addEventListener("click", () => {
  const now = new Date();
  const today = dateStr(now);

  if(state.challengeComplete){
    return;
  }
  if(!(state.checks.abs && state.checks.scissors && state.checks.plank)){
    showToast("Marca los 3 ejercicios primero.");
    return;
  }
  if(state.completedDayThisWindow === today){
    return; // already done
  }

  // Mark complete
  state.history[today] = "done";
  state.completedDayThisWindow = today;
  state.lastCompletedDate = today;
  state.streak += 1;
  if(state.streak > state.bestStreak) state.bestStreak = state.streak;

  const finishedChallenge = state.currentDay >= 30;
  if(finishedChallenge){
    state.challengeComplete = true;
  } else {
    state.currentDay += 1;
  }
  state.checks = { abs:false, scissors:false, plank:false };
  saveState();

  vibrate([20,40,20]);
  launchConfetti();
  showCompleteModal(finishedChallenge);
});

function showCompleteModal(finishedChallenge){
  const overlay = $("#overlayComplete");
  const title = $("#completeTitle");
  const text = $("#completeText");
  if(finishedChallenge){
    title.textContent = "¡Reto completado! 🎉";
    text.textContent = `30 días de constancia. Racha final: ${state.streak} días. Has terminado el reto.`;
  } else {
    title.textContent = `Día ${state.currentDay - 1} completado`;
    text.textContent = `Racha actual: ${state.streak} días. Mañana, día ${state.currentDay}.`;
  }
  overlay.classList.add("show");
}

$("#closeComplete").addEventListener("click", () => {
  $("#overlayComplete").classList.remove("show");
  goToScreen("home");
});

// ====== STREAK LOST ======
function showStreakLost(){
  $("#streakLost").classList.add("show");
  vibrate([30,60,30,60,30]);
}

$("#acceptStreakLost").addEventListener("click", () => {
  $("#streakLost").classList.remove("show");
  goToScreen("home");
});

// Manual reset confirm (optional entry point could be added; kept for safety/testing)
$("#cancelReset").addEventListener("click", () => {
  $("#overlayConfirm").classList.remove("show");
});
$("#confirmReset").addEventListener("click", () => {
  resetStreakAndDay();
  $("#overlayConfirm").classList.remove("show");
  goToScreen("home");
});

// ====== TOAST ======
let toastTimer = null;
function showToast(msg, warn=false){
  toast.textContent = msg;
  toast.classList.toggle("warn", warn);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// ====== VIBRATION ======
function vibrate(pattern){
  if("vibrate" in navigator){
    try{ navigator.vibrate(pattern); }catch(e){}
  }
}

// ====== CONFETTI (subtle) ======
function launchConfetti(){
  const container = $("#confetti");
  container.innerHTML = ""; // clear any previous run
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  $("#confetti").appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const colors = ["#ff6b4a","#34d399","#f5f5f7","#ffb38a"];
  const particles = Array.from({length: 36}, () => ({
    x: Math.random()*canvas.width,
    y: -20 - Math.random()*100,
    r: 3 + Math.random()*4,
    c: colors[Math.floor(Math.random()*colors.length)],
    vx: (Math.random()-0.5)*1.2,
    vy: 2 + Math.random()*2.5,
    rot: Math.random()*360,
    vrot: (Math.random()-0.5)*6,
    life: 0
  }));
  let frame = 0;
  function draw(){
    frame++;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let alive = false;
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vrot; p.life++;
      if(p.y < canvas.height + 30) alive = true;
      const alpha = Math.max(0, 1 - p.life/140);
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rot * Math.PI/180);
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.6);
      ctx.restore();
    });
    if(alive && frame < 160){
      requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }
  draw();
}

// ====== INIT ======
function init(){
  if(state.cycleStartDate === null){
    state.cycleStartDate = dateStr(new Date());
    saveState();
  }
  // initial rollover check
  const result = processDayRollover();
  renderHome();
  renderTraining();
  renderHistory();
  if(result.lostStreak){
    showStreakLost();
  }
  tick();
  setInterval(tick, 1000);
}

init();

// Register service worker for PWA
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}
