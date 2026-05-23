const eastboundList = document.querySelector("#eastbound-list");
const westboundList = document.querySelector("#westbound-list");
const broadStreetList = document.querySelector("#broad-street-list");
const clock = document.querySelector("#clock");
const refreshNote = document.querySelector("#refresh-note");
const alertNote = document.querySelector("#alert-note");
const statusLine = document.querySelector("#status-line");
const template = document.querySelector("#departure-row-template");
const directionButtons = [...document.querySelectorAll("[data-direction-toggle]")];
const directionCards = [...document.querySelectorAll("[data-direction-card]")];
const TIME_ZONE = "America/New_York";
let activeMobileDirection = "westbound";
let currentBoardData = null;
const expandedDepartures = new Set();

function formatClock() {
  clock.textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function formatDepartureTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function minutesLabel(departure) {
  const minutesUntil = Math.round((departure.departureTs - Date.now()) / 60000);
  if (minutesUntil <= 1) {
    return "Due now";
  }

  return `${minutesUntil} min`;
}

function buildStatus(departure) {
  const minutesUntil = Math.round((departure.departureTs - Date.now()) / 60000);
  const delay = departure.delayMinutes;

  if (minutesUntil <= 1) {
    return { label: "Boarding", className: "status-soon" };
  }

  if (typeof delay === "number") {
    if (delay >= 2) {
      return { label: `${delay}m late`, className: "status-late" };
    }

    if (delay <= -2) {
      return { label: `${Math.abs(delay)}m early`, className: "status-early" };
    }

    return { label: "On time", className: "status-on-time" };
  }

  if (minutesUntil < 0) {
    return { label: "Due", className: "status-late" };
  }

  return { label: `${minutesUntil} min`, className: "status-default" };
}

function departureKey(direction, departure) {
  return [
    direction.direction,
    departure.tripId || "live",
    departure.scheduledTs || departure.departureTs
  ].join("-");
}

function updateMobileDirection(direction) {
  activeMobileDirection = direction;

  directionButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.directionToggle === activeMobileDirection
    );
  });

  directionCards.forEach((card) => {
    const shouldHide = card.dataset.directionCard !== activeMobileDirection;
    card.classList.toggle("is-mobile-hidden", shouldHide);
  });
}

function renderStopDetails(row, departure) {
  const details = document.createElement("div");
  details.className = "stop-details";

  const stops = departure.downstreamStops || [];
  if (!stops.length) {
    details.innerHTML = "<p>Stop timing unavailable for this live post.</p>";
    row.append(details);
    return;
  }

  stops.forEach((stop) => {
    const item = document.createElement("span");
    item.className = "stop-detail";
    item.innerHTML = `
      <strong>${stop.label}</strong>
      <small>${formatDepartureTime(stop.departureTs)}</small>
    `;
    details.append(item);
  });

  row.append(details);
}

function renderBoard(container, direction, options = {}) {
  container.innerHTML = "";

  if (!direction?.departures?.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No departures posted";
    container.append(empty);
    return;
  }

  const visibleLimit = options.limit || 4;
  const visibleDepartures = direction.departures.slice(0, visibleLimit);

  visibleDepartures.forEach((departure) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const status = buildStatus(departure);
    const key = departureKey(direction, departure);
    const routeField = row.querySelector("[data-field='route']");
    const destinationField = row.querySelector("[data-field='destination']");
    const timeField = row.querySelector("[data-field='time']");
    const statusField = row.querySelector("[data-field='status']");

    routeField.innerHTML = `
      <strong>${departure.route}</strong>
      <small>${direction.direction}</small>
    `;
    const destinationText = options.destinationField === "stop"
      ? departure.stopName || direction.destination
      : direction.destination;

    destinationField.innerHTML = `
      <strong>${destinationText}</strong>
      <small>${options.destinationNote || (departure.scheduledDisplay ? `Sched ${departure.scheduledDisplay}` : "Schedule pending")}</small>
    `;
    timeField.innerHTML = options.expandable ? `
      <button class="time-toggle" type="button" aria-expanded="${expandedDepartures.has(key)}">
        <strong>${formatDepartureTime(departure.departureTs)}</strong>
        <small>${departure.tripId ? "Stops" : "Live post"}</small>
      </button>
    ` : `
      <strong>${formatDepartureTime(departure.departureTs)}</strong>
      <small>${departure.tripId ? `Trip ${departure.tripId}` : "Live post"}</small>
    `;
    if (options.statusMode === "away") {
      statusField.innerHTML = `
        <strong>${minutesLabel(departure)}</strong>
        <small>away</small>
      `;
      statusField.className = "status-pill status-default";
    } else {
      statusField.innerHTML = `
        <strong>${status.label}</strong>
        <small>${minutesLabel(departure)}</small>
      `;
      statusField.className = `status-pill ${status.className}`;
    }
    row.dataset.departureKey = key;

    if (expandedDepartures.has(key)) {
      row.classList.add("is-expanded");
      renderStopDetails(row, departure);
    }

    container.append(row);
  });
}

function renderAllBoards(data) {
  renderBoard(eastboundList, data.eastbound, {
    destinationField: "stop",
    destinationNote: "Eastbound",
    limit: 9
  });
  renderBoard(westboundList, data.westbound, { expandable: true });
  renderBoard(broadStreetList, data.broadStreetSouthbound, {
    destinationNote: "Southbound",
    expandable: true,
    statusMode: "away"
  });
  renderMeta(data);
  updateMobileDirection(activeMobileDirection);
}

function renderMeta(data) {
  const refreshed = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(data.refreshedAt));

  refreshNote.textContent = `Last refresh ${refreshed}`;
  alertNote.textContent = data.alerts.length
    ? `Alert: ${data.alerts[0]}`
    : "No active service alerts.";
  statusLine.textContent =
    "Berks board refreshes every 20 seconds and compares SEPTA's posted departures against the active L1 timetable.";
}

async function loadBoard() {
  try {
    const response = await fetch("/api/arrivals", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Request failed");
    }

    currentBoardData = await response.json();
    renderAllBoards(currentBoardData);
  } catch {
    statusLine.textContent = "SEPTA feed unavailable. Retrying shortly.";
    refreshNote.textContent = "Live feed temporarily unavailable.";
    alertNote.textContent = "Check back in a moment.";
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) {
        return;
      }

      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

directionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    updateMobileDirection(button.dataset.directionToggle);
  });
});

[eastboundList, westboundList, broadStreetList].forEach((container) => {
  container.addEventListener("click", (event) => {
    const toggle = event.target.closest(".time-toggle");
    if (!toggle) {
      return;
    }

    const key = toggle.closest(".departure-row")?.dataset.departureKey;
    if (!key) {
      return;
    }

    if (expandedDepartures.has(key)) {
      expandedDepartures.delete(key);
    } else {
      expandedDepartures.add(key);
    }

    if (currentBoardData) {
      renderAllBoards(currentBoardData);
    }
  });
});

window.addEventListener("resize", () => {
  updateMobileDirection(activeMobileDirection);
});

formatClock();
loadBoard();
updateMobileDirection(activeMobileDirection);

setInterval(formatClock, 1000);
setInterval(loadBoard, 20000);
