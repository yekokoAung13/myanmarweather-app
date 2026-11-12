const DATA_URL =
  "https://raw.githubusercontent.com/open-admin-data/myanmar-administrative-divisions/main/data/all-township.json";

const CACHE_TTL = 21600;
const BATCH_SIZE = 50;

export async function onRequest({ request }) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const cache = caches.default;
  const cacheKey = new Request(
    new URL("/api/rankings-cache-v1", request.url).toString()
  );

  const cached = await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const townResponse = await fetch(DATA_URL);

    if (!townResponse.ok) {
      throw new Error("Township data download failed");
    }

    const all = await townResponse.json();

    const townships = all.filter(t =>
      t.geo?.lat != null &&
      t.geo?.lon != null
    );

    const batches = [];

    for (let i = 0; i < townships.length; i += BATCH_SIZE) {
      batches.push(townships.slice(i, i + BATCH_SIZE));
    }

    const results = new Array(batches.length);
    let nextBatch = 0;

    async function worker() {
      while (true) {
        const index = nextBatch++;

        if (index >= batches.length) return;

        const batch = batches[index];

        const params = new URLSearchParams({
          latitude: batch.map(t => t.geo.lat).join(","),
          longitude: batch.map(t => t.geo.lon).join(","),
          daily: "temperature_2m_max,precipitation_probability_max",
          timezone: "Asia/Yangon",
          forecast_days: "7"
        });

        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?" + params
        );

        if (!response.ok) {
          throw new Error("Open-Meteo API error: " + response.status);
        }

        const data = await response.json();
        const locations = Array.isArray(data) ? data : [data];

        if (locations.length !== batch.length) {
          throw new Error("Weather result count mismatch");
        }

        results[index] = batch.map((town, i) => {
          const region = (town.ancestors || []).find(
            a => Number(a.level) === 1
          );

          return {
            id: town.id,
            name: town.name.local,
            nameEn: town.name.en,
            region: region?.name?.local || "မသိရှိပါ",
            regionId: region?.id || "",
            temperature: locations[i].daily.temperature_2m_max,
            rain: locations[i].daily.precipitation_probability_max
          };
        });
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(3, batches.length) },
        () => worker()
      )
    );

    const dateList = results[0]?.length
      ? (await fetch(
          "https://api.open-meteo.com/v1/forecast?" +
          new URLSearchParams({
            latitude: townships[0].geo.lat,
            longitude: townships[0].geo.lon,
            daily: "temperature_2m_max",
            timezone: "Asia/Yangon",
            forecast_days: "7"
          })
        ).then(r => r.json())).daily.time
      : [];

    const output = {
      source: "Open-Meteo",
      sourceType: "မိုးလေဝသ မော်ဒယ်ခန့်မှန်းချက်",
      updatedAt: new Date().toISOString(),
      dates: dateList,
      totalTownships: all.length,
      includedTownships: townships.length,
      excludedTownships: all.length - townships.length,
      townships: results.flat()
    };

    const result = new Response(JSON.stringify(output), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=21600"
      }
    });

    await cache.put(cacheKey, result.clone());

    return result;

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "မိုးလေဝသ Ranking အချက်အလက် ရယူမရပါ။",
        detail: error.message
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  }
}
