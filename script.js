const CHANNEL_ID = "3292090";
const READ_API_KEY = "T6N62ICRCUKO4POI"; // add if private channel
const TOTAL_SLOTS = 3;
const FEED_RESULTS = 8000;

let hourlyChart, distributionChart, weekdayChart, slotUsageChart, fullEventsChart;

function buildFeedUrl() {
  let url = `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?results=${FEED_RESULTS}`;
  if (READ_API_KEY.trim() !== "") {
    url += `&api_key=${READ_API_KEY}`;
  }
  return url;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function slotStateFromField(value) {
  return value === 1 ? "VACANT" : "FULL";
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

function destroyIfExists(chart) {
  if (chart) chart.destroy();
}

function setSlotUI(elementId, isVacant) {
  const el = document.getElementById(elementId);
  el.textContent = isVacant ? "VACANT" : "FULL";
  el.className = `slot-status ${isVacant ? "vacant" : "full"}`;
}

async function loadDashboard() {
  try {
    const response = await fetch(buildFeedUrl());
    const data = await response.json();

    if (!data.feeds || data.feeds.length === 0) {
      alert("No data found in ThingSpeak channel.");
      return;
    }

    const parsedFeeds = data.feeds
      .map(feed => {
        const p1 = safeNum(feed.field1);
        const p2 = safeNum(feed.field2);
        const p3 = safeNum(feed.field3);

        if (p1 === null || p2 === null || p3 === null) return null;

        const vacantCount = (p1 === 1 ? 1 : 0) + (p2 === 1 ? 1 : 0) + (p3 === 1 ? 1 : 0);
        const fullCount = TOTAL_SLOTS - vacantCount;
        const occupancyPercent = (fullCount / TOTAL_SLOTS) * 100;

        return {
          created_at: feed.created_at,
          date: new Date(feed.created_at),
          p1,
          p2,
          p3,
          vacantCount,
          fullCount,
          occupancyPercent
        };
      })
      .filter(Boolean);

    if (parsedFeeds.length === 0) {
      alert("Fields 1, 2, 3 data not available.");
      return;
    }

    updateCurrentStatus(parsedFeeds);
    updateAnalytics(parsedFeeds);
    updateRecentTable(parsedFeeds);
  } catch (err) {
    console.error(err);
    alert("Failed to load ThingSpeak data.");
  }
}

function updateCurrentStatus(feeds) {
  const latest = feeds[feeds.length - 1];

  setSlotUI("p1Status", latest.p1 === 1);
  setSlotUI("p2Status", latest.p2 === 1);
  setSlotUI("p3Status", latest.p3 === 1);

  document.getElementById("vacantCount").textContent = latest.vacantCount;
  document.getElementById("fullCount").textContent = latest.fullCount;
  document.getElementById("occupancyPercent").textContent = `${latest.occupancyPercent.toFixed(0)}%`;
  document.getElementById("lastUpdated").textContent = formatDate(latest.created_at);

  const alertBox = document.getElementById("alertBox");
  alertBox.style.display = latest.fullCount === TOTAL_SLOTS ? "block" : "none";

  destroyIfExists(distributionChart);
  distributionChart = new Chart(document.getElementById("distributionChart"), {
    type: "doughnut",
    data: {
      labels: ["Vacant", "Full"],
      datasets: [{
        data: [latest.vacantCount, latest.fullCount],
        backgroundColor: ["#22c55e", "#ef4444"],
        borderColor: "#111827",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: "#e5e7eb" }
        }
      }
    }
  });
}

function updateAnalytics(feeds) {
  const hourly = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
  const weekdays = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  const slotOccupiedSamples = [0, 0, 0];
  const fullEventsPerDay = {};
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  feeds.forEach((f, idx) => {
    const hour = f.date.getHours();
    const day = f.date.getDay();

    hourly[hour].total += f.fullCount;
    hourly[hour].count += 1;

    weekdays[day].total += f.fullCount;
    weekdays[day].count += 1;

    if (f.p1 === 0) slotOccupiedSamples[0]++;
    if (f.p2 === 0) slotOccupiedSamples[1]++;
    if (f.p3 === 0) slotOccupiedSamples[2]++;

    const dayKey = f.date.toISOString().slice(0, 10);

    const isAllFull = f.fullCount === TOTAL_SLOTS;
    const prevAllFull = idx > 0 ? feeds[idx - 1].fullCount === TOTAL_SLOTS : false;

    if (isAllFull && !prevAllFull) {
      fullEventsPerDay[dayKey] = (fullEventsPerDay[dayKey] || 0) + 1;
    }
  });

  const hourlyAvg = hourly.map(h => (h.count ? h.total / h.count : 0));
  const weekdayAvg = weekdays.map(d => (d.count ? d.total / d.count : 0));

  const peakHourIndex = hourlyAvg.indexOf(Math.max(...hourlyAvg));
  const busiestDayIndex = weekdayAvg.indexOf(Math.max(...weekdayAvg));

  document.getElementById("peakHour").textContent = `${peakHourIndex.toString().padStart(2, "0")}:00`;
  document.getElementById("busiestDay").textContent = dayNames[busiestDayIndex];

  destroyIfExists(hourlyChart);
  hourlyChart = new Chart(document.getElementById("hourlyChart"), {
    type: "line",
    data: {
      labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
      datasets: [{
        label: "Average Full Slots",
        data: hourlyAvg.map(v => Number(v.toFixed(2))),
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.2)",
        tension: 0.3,
        fill: true,
        pointRadius: 3
      }]
    },
    options: {
      scales: {
        x: {
          ticks: { color: "#cbd5e1" },
          grid: { color: "rgba(148,163,184,0.15)" }
        },
        y: {
          min: 0,
          max: 3,
          ticks: { color: "#cbd5e1", stepSize: 1 },
          grid: { color: "rgba(148,163,184,0.15)" }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#e5e7eb" }
        }
      }
    }
  });

  destroyIfExists(weekdayChart);
  weekdayChart = new Chart(document.getElementById("weekdayChart"), {
    type: "bar",
    data: {
      labels: dayNames,
      datasets: [{
        label: "Avg Full Slots",
        data: weekdayAvg.map(v => Number(v.toFixed(2))),
        backgroundColor: "#8b5cf6"
      }]
    },
    options: {
      scales: {
        x: {
          ticks: { color: "#cbd5e1" },
          grid: { color: "rgba(148,163,184,0.15)" }
        },
        y: {
          min: 0,
          max: 3,
          ticks: { color: "#cbd5e1", stepSize: 1 },
          grid: { color: "rgba(148,163,184,0.15)" }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#e5e7eb" }
        }
      }
    }
  });

  const totalSamples = feeds.length || 1;
  const slotUsagePercent = slotOccupiedSamples.map(v => Number(((v / totalSamples) * 100).toFixed(1)));

  destroyIfExists(slotUsageChart);
  slotUsageChart = new Chart(document.getElementById("slotUsageChart"), {
    type: "bar",
    data: {
      labels: ["P1", "P2", "P3"],
      datasets: [{
        label: "Occupied %",
        data: slotUsagePercent,
        backgroundColor: ["#06b6d4", "#f59e0b", "#ef4444"]
      }]
    },
    options: {
      scales: {
        x: {
          ticks: { color: "#cbd5e1" },
          grid: { color: "rgba(148,163,184,0.15)" }
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: "#cbd5e1" },
          grid: { color: "rgba(148,163,184,0.15)" }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#e5e7eb" }
        }
      }
    }
  });

  const fullEventLabels = Object.keys(fullEventsPerDay).sort();
  const fullEventValues = fullEventLabels.map(k => fullEventsPerDay[k]);

  destroyIfExists(fullEventsChart);
  fullEventsChart = new Chart(document.getElementById("fullEventsChart"), {
    type: "bar",
    data: {
      labels: fullEventLabels.length ? fullEventLabels : ["No Data"],
      datasets: [{
        label: "All-Full Entries",
        data: fullEventLabels.length ? fullEventValues : [0],
        backgroundColor: "#ef4444"
      }]
    },
    options: {
      scales: {
        x: {
          ticks: { color: "#cbd5e1" },
          grid: { color: "rgba(148,163,184,0.15)" }
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#cbd5e1", stepSize: 1 },
          grid: { color: "rgba(148,163,184,0.15)" }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#e5e7eb" }
        }
      }
    }
  });
}

function updateRecentTable(feeds) {
  const tbody = document.getElementById("recentTableBody");
  tbody.innerHTML = "";

  const recent = feeds.slice(-15).reverse();

  recent.forEach(f => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(f.created_at)}</td>
      <td style="color:${f.p1 === 1 ? '#22c55e' : '#ef4444'}">${slotStateFromField(f.p1)}</td>
      <td style="color:${f.p2 === 1 ? '#22c55e' : '#ef4444'}">${slotStateFromField(f.p2)}</td>
      <td style="color:${f.p3 === 1 ? '#22c55e' : '#ef4444'}">${slotStateFromField(f.p3)}</td>
      <td>${f.vacantCount}</td>
      <td>${f.fullCount}</td>
      <td>${f.occupancyPercent.toFixed(0)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

loadDashboard();
setInterval(loadDashboard, 15000);