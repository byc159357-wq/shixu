import { net } from 'electron'
import type { WeatherNow } from '../../shared/types'

const CODES: Record<number, string> = {
  0: '晴',
  1: '多云',
  2: '阴',
  3: '多云',
  45: '雾',
  48: '雾凇',
  51: '毛毛雨',
  53: '细雨',
  55: '小雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '阵雨',
  81: '强阵雨',
  82: '暴雨',
  95: '雷阵雨',
  96: '雷阵雨伴冰雹',
  99: '强雷暴'
}

type GeoRes = {
  results?: Array<{
    latitude: number
    longitude: number
    name: string
    country?: string
    admin1?: string
    admin2?: string
    feature_code?: string
  }>
}
type FcRes = {
  current?: { temperature_2m: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number }
  daily?: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}

/**
 * Live weather via Open-Meteo forecast (free, no API key). Runs in the main
 * process so the renderer never hits a CORS / CSP wall. Unknown city → null.
 *
 * Geocoding uses Nominatim (Open-Stream-Map) first because its Chinese division
 * coverage — counties / districts like 朝阳区, 平谷县 — is far better than the
 * GeoNames-backed Open-Meteo index, which returns nothing for suffixed Chinese
 * names and confuses same-name townships for major districts. Forecast data
 * still comes from Open-Meteo.
 */
export class WeatherService {
  async get(city: string): Promise<WeatherNow | null> {
    try {
      const loc = await this.resolve(city || '北京')
      if (!loc) return null
      const fc = (await (await net.fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
          `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`
      )).json()) as FcRes
      const c = fc.current
      const d = fc.daily
      if (!c || !d) return null
      return {
        city: loc.label,
        temp: Math.round(c.temperature_2m),
        humidity: Math.round(c.relative_humidity_2m),
        windSpeed: Math.round(c.wind_speed_10m),
        code: c.weather_code,
        text: CODES[c.weather_code] ?? '未知',
        daily: d.time.map((t, i) => ({
          date: t,
          code: d.weather_code[i],
          text: CODES[d.weather_code[i]] ?? '未知',
          tmax: Math.round(d.temperature_2m_max[i]),
          tmin: Math.round(d.temperature_2m_min[i])
        }))
      }
    } catch {
      return null
    }
  }

  private async resolve(city: string): Promise<Point | null> {
    const q = encodeURIComponent(city.trim())
    // 1) Nominatim — accurate for suffixed Chinese counties/districts.
    try {
      const res = await net.fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=zh&countrycodes=cn&q=${q}`,
        { headers: { 'User-Agent': 'ATELIER/0.1.0 (ATELIER desktop app; weather widget)' } }
      )
      const arr = (await res.json()) as Array<{ lat: string; lon: string; name?: string; address?: Record<string, string>; display_name?: string }>
      if (Array.isArray(arr) && arr[0]) {
        const it = arr[0]
        return { latitude: Number(it.lat), longitude: Number(it.lon), label: nomLabel(it) }
      }
    } catch {
      // fall through to Open-Meteo
    }
    // 2) Open-Meteo geocoding as a keyless fallback.
    try {
      const geo = (await (await net.fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=10&language=zh&format=json`
      )).json()) as GeoRes
      const loc = pickCountyLevel(geo.results)
      if (loc) return { latitude: loc.latitude, longitude: loc.longitude, label: formatCity(loc) }
    } catch {
      // ignore
    }
    // 3) Strip a county/district suffix and retry Nominatim once — catches the
    //    rare case where a short comune name only resolves without its class tag.
    try {
      const stripped = city.replace(/(县|区|市|旗|镇|乡|盟)$/, '')
      if (stripped && stripped !== city) {
        const res = await net.fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=zh&countrycodes=cn&q=${encodeURIComponent(stripped)}`,
          { headers: { 'User-Agent': 'ATELIER/0.1.0 (ATELIER desktop app; weather widget)' } }
        )
        const arr = (await res.json()) as Array<{ lat: string; lon: string; name?: string; address?: Record<string, string>; display_name?: string }>
        if (Array.isArray(arr) && arr[0]) {
          const it = arr[0]
          return { latitude: Number(it.lat), longitude: Number(it.lon), label: nomLabel(it) }
        }
      }
    } catch {
      // ignore
    }
    return null
  }
}

type Point = { latitude: number; longitude: number; label: string }

/** Build a readable Chinese locality label from a Nominatim result: the finest
 *  county/district + its subregion, e.g. "朝阳 · 北京市". */
function nomLabel(it: { name?: string; address?: Record<string, string>; display_name?: string }): string {
  const ad = it.address ?? {}
  const fine = ad.county ?? ad.district ?? ad.town ?? ad.city ?? ad.state ?? ''
  const state = ad.state ?? ''
  const parts: string[] = []
  if (fine && fine !== it.name) parts.push(fine)
  if (state && state !== fine && state !== it.name) parts.push(state)
  if (!parts.length) {
    const first = (it.display_name ?? '').split(',')[0]?.trim()
    if (first) parts.push(first)
  }
  return Array.from(new Set(parts)).join(' · ')
}

type Loc = NonNullable<GeoRes['results']>[number]

/** Open-Meteo geocoding often returns several candidates for one name. Prefer
 *  the finest administrative level (county/district = admin2, e.g. 朝阳区) so
 *  weather is accurate to the county instead of always the provincial center. */
function pickCountyLevel(results?: Loc[]): Loc | undefined {
  if (!results?.length) return undefined
  // Explicit county/district locality wins immediately.
  const explicit = results.find((r) => /区|县|旗|镇|乡|市辖/.test(r.name ?? ''))
  if (explicit) return explicit
  // Otherwise prefer the candidate that carries a distinct admin2 (each county
  // the API indexes has one), falling back to the first (best-scored) match.
  return results.find((r) => (r.admin2 && r.admin2 !== r.name) || /ADM[123]|PPLA[21]?/.test(r.feature_code ?? '')) ?? results[0]
}

/** Show the finest Chinese localities first (county · subregion), e.g.
 *  "朝阳区 · 北京市". The English country suffix is dropped — it adds no
 *  precision and reads noisier next to a rounded degree figure. */
function formatCity(loc: Loc): string {
  const parts: string[] = []
  if (loc.admin2 && loc.admin2 !== loc.name) parts.push(loc.admin2)
  if (loc.admin1 && loc.admin1 !== loc.name) parts.push(loc.admin1)
  if (!parts.length) parts.push(loc.name)
  const dedup = Array.from(new Set(parts)) as string[]
  return dedup.join(' · ')
}