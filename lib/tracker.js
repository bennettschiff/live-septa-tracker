import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const execFileAsync = promisify(execFile);
const TIME_ZONE = "America/New_York";
let scheduleCachePromise;
let tripStopTimesPromise;
let broadStreetSchedulePromise;

const L1_TARGET_STOPS = {
  eastbound: [
    ["2461", "York-Dauphin"],
    ["2462", "Huntingdon"],
    ["797", "Somerset"],
    ["60", "Kensington-Allegheny"],
    ["2463", "Tioga"],
    ["838", "Erie-Torresdale"],
    ["2464", "Church"],
    ["217", "Arrott TC"],
    ["61", "Frankford TC"]
  ],
  westbound: [
    ["32168", "Girard"],
    ["32169", "Spring Garden"],
    ["32170", "2nd"],
    ["32171", "5th"],
    ["32172", "8th"],
    ["32173", "11th"],
    ["32174", "13th"],
    ["32175", "15th/City Hall"],
    ["32176", "30th"],
    ["32177", "34th"],
    ["32178", "40th"]
  ]
};

const BSL_CITY_HALL_SOUTHBOUND = {
  stopId: "33029",
  directionId: "0",
  routeId: "B1",
  label: "Southbound",
  destination: "NRG",
  allowScheduledFallback: true
};

const BSL_TARGET_STOPS = [
  ["1282", "Walnut-Locust"],
  ["1283", "Lombard-South"],
  ["1284", "Ellsworth-Federal"],
  ["1285", "Tasker-Morris"],
  ["1286", "Snyder"],
  ["20967", "Oregon"],
  ["152", "NRG/Stadiums"]
];

const HOME_FROM_CITY_STOPS = [
  ["32176", "30th"],
  ["32175", "15th/City Hall"],
  ["32174", "13th"],
  ["32173", "11th"],
  ["32172", "8th"],
  ["32171", "5th"],
  ["32170", "2nd"],
  ["32169", "Spring Garden"],
  ["32168", "Girard"]
].map(([stopId, destination]) => ({
  stopId,
  directionId: "1",
  routeId: "L1",
  label: "Home from City",
  destination
}));

export const BERKS_STOPS = {
  eastbound: {
    stopId: "2460",
    directionId: "0",
    label: "Eastbound",
    destination: "Frankford TC"
  },
  westbound: {
    stopId: "32167",
    directionId: "1",
    label: "Into City",
    destination: "69th St TC"
  }
};

export async function fetchText(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "berks-tracker"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return await response.text();
  } catch {
    const { stdout } = await execFileAsync("curl", ["-L", url], {
      maxBuffer: 1024 * 1024 * 4
    });
    return stdout;
  }
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

async function readScheduleBundle() {
  const contents = await readFile(
    path.join(projectRoot, "data", "berks-schedule.json"),
    "utf8"
  );
  return JSON.parse(contents);
}

function convertTimeToTimestamp(timeString) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeString.trim());
  if (!match) {
    return null;
  }

  const now = Date.now();
  const today = getZonedDateParts(new Date(now));
  let departureTs = zonedTimeToUtcTimestamp(
    today.year,
    today.month,
    today.day,
    Number(match[1]),
    Number(match[2]),
    0
  );

  if (departureTs < now - 6 * 60 * 60 * 1000) {
    const tomorrow = getZonedDateParts(new Date(now + 24 * 60 * 60 * 1000));
    departureTs = zonedTimeToUtcTimestamp(
      tomorrow.year,
      tomorrow.month,
      tomorrow.day,
      Number(match[1]),
      Number(match[2]),
      0
    );
  }

  return departureTs;
}

function formatTimestampToTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function getZonedDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const get = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
    weekday: parts.find((part) => part.type === "weekday")?.value?.toLowerCase()
  };
}

function getTimeZoneOffsetMs(timestamp) {
  const parts = getZonedDateParts(new Date(timestamp));
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - timestamp;
}

function zonedTimeToUtcTimestamp(year, month, day, hour, minute, second) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  return utcGuess - getTimeZoneOffsetMs(utcGuess);
}

function parseGtfsTimeToTimestamp(serviceDate, timeString) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeString.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const serviceStart = zonedTimeToUtcTimestamp(
    serviceDate.year,
    serviceDate.month,
    serviceDate.day,
    0,
    0,
    0
  );
  return serviceStart + ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

function formatDateKey(serviceDate) {
  const month = String(serviceDate.month).padStart(2, "0");
  const day = String(serviceDate.day).padStart(2, "0");
  return `${serviceDate.year}${month}${day}`;
}

function buildActiveServiceIds(calendarRows, calendarDateRows, serviceDate) {
  const dateKey = formatDateKey(serviceDate);
  const weekdayField = serviceDate.weekday;

  const active = new Set(
    calendarRows
      .filter((row) => {
        return (
          row.start_date <= dateKey &&
          row.end_date >= dateKey &&
          row[weekdayField] === "1"
        );
      })
      .map((row) => row.service_id)
  );

  for (const row of calendarDateRows) {
    if (row.date !== dateKey) {
      continue;
    }

    if (row.exception_type === "1") {
      active.add(row.service_id);
    }

    if (row.exception_type === "2") {
      active.delete(row.service_id);
    }
  }

  return active;
}

async function loadScheduleCache() {
  const bundle = await readScheduleBundle();
  const departuresByStop = new Map(Object.entries(bundle.departuresByStop));
  return {
    calendarRows: bundle.calendarRows,
    calendarDateRows: bundle.calendarDateRows,
    departuresByStop
  };
}

async function getScheduleCache() {
  if (!scheduleCachePromise) {
    scheduleCachePromise = loadScheduleCache();
  }

  return scheduleCachePromise;
}

async function loadTripStopTimes() {
  const contents = await readFile(path.join(projectRoot, "data", "l1-stop-times.json"), "utf8");
  const bundle = JSON.parse(contents);
  return new Map(Object.entries(bundle.tripStopTimes));
}

async function getTripStopTimes() {
  if (!tripStopTimesPromise) {
    tripStopTimesPromise = loadTripStopTimes();
  }

  return tripStopTimesPromise;
}

async function loadBroadStreetSchedule() {
  const contents = await readFile(path.join(projectRoot, "data", "bsl-schedule.json"), "utf8");
  const bundle = JSON.parse(contents);
  return {
    departuresByStop: new Map(Object.entries(bundle.departuresByStop)),
    tripStopTimes: new Map(Object.entries(bundle.tripStopTimes))
  };
}

async function getBroadStreetSchedule() {
  if (!broadStreetSchedulePromise) {
    broadStreetSchedulePromise = loadBroadStreetSchedule();
  }

  return broadStreetSchedulePromise;
}

async function getScheduledDepartures(config, now = new Date()) {
  const [cache, routeSchedule] = await Promise.all([
    getScheduleCache(),
    config.routeId === "B1" ? getBroadStreetSchedule() : getTripStopTimes()
  ]);
  const departuresByStop = config.routeId === "B1"
    ? routeSchedule.departuresByStop
    : cache.departuresByStop;
  const tripStopTimes = config.routeId === "B1"
    ? routeSchedule.tripStopTimes
    : routeSchedule;
  const candidates = departuresByStop.get(config.stopId) || [];
  const nowTs = now.getTime();
  const today = getZonedDateParts(now);
  const tomorrow = getZonedDateParts(new Date(nowTs + 24 * 60 * 60 * 1000));
  const serviceDates = [
    today,
    tomorrow
  ];

  const results = [];
  for (const serviceDate of serviceDates) {
    const activeServiceIds = buildActiveServiceIds(
      cache.calendarRows,
      cache.calendarDateRows,
      serviceDate
    );

    for (const candidate of candidates) {
      if (
        candidate.directionId !== config.directionId ||
        !activeServiceIds.has(candidate.serviceId)
      ) {
        continue;
      }

      const departureTs = parseGtfsTimeToTimestamp(serviceDate, candidate.departureTime);
      if (!departureTs) {
        continue;
      }

      results.push({
        tripId: candidate.tripId,
        departureTs,
        scheduledDisplay: formatTimestampToTime(departureTs),
        downstreamStops: (tripStopTimes.get(candidate.tripId) || [])
          .map((stop) => {
            const stopTs = parseGtfsTimeToTimestamp(serviceDate, stop.departureTime);
            return {
              label: stop.label,
              departureTs: stopTs,
              scheduledDisplay: stopTs ? formatTimestampToTime(stopTs) : null
            };
          })
          .filter((stop) => stop.departureTs && stop.departureTs > departureTs)
      });
    }
  }

  return results
    .filter((entry) => entry.departureTs >= nowTs - 90 * 60 * 1000)
    .sort((left, right) => left.departureTs - right.departureTs);
}

function matchToSchedule(predictedDepartures, scheduledDepartures) {
  let cursor = 0;

  return predictedDepartures.map((departure) => {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (
      let index = cursor;
      index < scheduledDepartures.length && index < cursor + 16;
      index += 1
    ) {
      const scheduled = scheduledDepartures[index];
      const delta = Math.abs(scheduled.departureTs - departure.departureTs);

      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = index;
      }

      if (scheduled.departureTs > departure.departureTs + 20 * 60 * 1000) {
        break;
      }
    }

    if (bestIndex === -1) {
      return {
        ...departure,
        scheduledTs: null,
        scheduledDisplay: null,
        tripId: null,
        delayMinutes: null,
        downstreamStops: []
      };
    }

    cursor = bestIndex + 1;
    const scheduled = scheduledDepartures[bestIndex];

    const delayMs = departure.departureTs - scheduled.departureTs;
    return {
      ...departure,
      scheduledTs: scheduled.departureTs,
      scheduledDisplay: scheduled.scheduledDisplay,
      tripId: scheduled.tripId,
      delayMinutes: Math.round(delayMs / 60000),
      downstreamStops: scheduled.downstreamStops.map((stop) => ({
        ...stop,
        departureTs: stop.departureTs + delayMs
      }))
    };
  });
}

export function parseSmsResponse(text, config) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "Unable to load schedule");

  const departures = lines
    .map((line) => {
      const match = /Rt\.\s+([A-Z0-9 ]+)\s+@\s+(\d{1,2}:\d{2})/i.exec(line);
      if (!match) {
        return null;
      }

      return {
        route: match[1].trim(),
        scheduledTime: match[2],
        departureTs: convertTimeToTimestamp(match[2])
      };
    })
    .filter(Boolean);

  return {
    direction: config.label,
    destination: config.destination,
    stopId: config.stopId,
    stopName: lines[0] || "Berks",
    scheduleLabel: lines[1] || config.label,
    departures
  };
}

export async function fetchSmsArrivals(config) {
  const url = new URL("https://www3.septa.org/api/sms/index.php");
  url.searchParams.set("req1", config.stopId);
  url.searchParams.set("req2", config.routeId || "L1");
  url.searchParams.set("req3", config.directionId);

  const [text, scheduledDepartures] = await Promise.all([
    fetchText(url.toString()),
    getScheduledDepartures(config)
  ]);
  const parsed = parseSmsResponse(text, config);
  const departures = parsed.departures.length || !config.allowScheduledFallback
    ? parsed.departures
    : scheduledDepartures
      .filter((departure) => departure.departureTs >= Date.now() - 60 * 1000)
      .slice(0, 4)
      .map((departure) => ({
        route: config.routeId || "L1",
        departureTs: departure.departureTs,
        scheduledTs: departure.departureTs,
        scheduledDisplay: departure.scheduledDisplay,
        tripId: departure.tripId,
        delayMinutes: 0,
        downstreamStops: departure.downstreamStops
      }));

  return {
    ...parsed,
    departures: parsed.departures.length
      ? matchToSchedule(departures, scheduledDepartures)
      : departures
  };
}

async function fetchHomeFromCityArrivals() {
  const boards = await Promise.all(
    HOME_FROM_CITY_STOPS.map(async (config) => {
      const url = new URL("https://www3.septa.org/api/sms/index.php");
      url.searchParams.set("req1", config.stopId);
      url.searchParams.set("req2", config.routeId);
      url.searchParams.set("req3", config.directionId);

      try {
        const text = await fetchText(url.toString());
        const parsed = parseSmsResponse(text, config);
        const nextDeparture = parsed.departures
          .filter((departure) => departure.departureTs >= Date.now() - 60 * 1000)
          .sort((left, right) => left.departureTs - right.departureTs)[0];

        if (!nextDeparture) {
          return null;
        }

        return {
          route: nextDeparture.route,
          departureTs: nextDeparture.departureTs,
          scheduledDisplay: nextDeparture.scheduledTime,
          stopName: config.destination
        };
      } catch {
        return null;
      }
    })
  );

  return {
    direction: "Home from City",
    destination: "Berks",
    stopName: "Center City",
    scheduleLabel: "Eastbound to Berks",
    departures: boards.filter(Boolean)
  };
}

export async function fetchAlerts() {
  const url = "https://www3.septa.org/api/Alerts/get_alert_data.php?route_id=bus_route_L1";
  let payload;
  try {
    payload = await fetchJson(url);
  } catch {
    return [];
  }

  if (!Array.isArray(payload) || payload[0]?.Error) {
    return [];
  }

  return payload
    .map((item) => item.advisory_message || item.detour_message || item.message)
    .filter(Boolean);
}

export async function getArrivalsPayload() {
  const [homeFromCity, westbound, broadStreetSouthbound, alerts] = await Promise.all([
    fetchHomeFromCityArrivals(),
    fetchSmsArrivals(BERKS_STOPS.westbound),
    fetchSmsArrivals(BSL_CITY_HALL_SOUTHBOUND),
    fetchAlerts()
  ]);

  return {
    stop: "Berks",
    route: "L1",
    routeName: "Market-Frankford Line",
    refreshedAt: new Date().toISOString(),
    alerts,
    eastbound: homeFromCity,
    westbound,
    broadStreetSouthbound
  };
}
