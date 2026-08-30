"use client";

import {
  weatherCodeLabel,
  weatherConditionFromReading,
  type WeatherCondition,
  type WeatherReading
} from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";
import { WeatherMotion } from "@/components/desktop/weather-motion";

export function WeatherPanel({
  t,
  city,
  weather,
  status,
  onCityChange,
  onRefresh
}: {
  t: I18nMessages;
  city: string;
  weather: WeatherReading | null;
  status: string;
  onCityChange: (city: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const condition: WeatherCondition = weatherConditionFromReading(weather);
  const place = weather ? [weather.place, weather.country].filter(Boolean).join(", ") : city || t.weather.chooseCity;

  return (
    <div className={`builtin-panel weather-panel weather-theme-${condition}`}>
      <div className="weather-hero">
        <section className="weather-current">
          <span className="settings-kicker">{t.weather.liveWeather}</span>
          <h2>{place}</h2>
          <strong>{weather ? `${Math.round(weather.temperature)}°` : "--°"}</strong>
          <p>
            {weather
              ? t.weather.currentSummary(weatherCodeLabel(weather.code, t), weather.humidity, weather.windSpeed)
              : status || t.weather.searchCity}
          </p>
          <div className="weather-search">
            <input
              value={city}
              onChange={(event) => onCityChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void onRefresh();
                }
              }}
              aria-label={t.weather.cityAria}
              placeholder={t.weather.cityPlaceholder}
            />
            <button className="primary-action" onClick={() => void onRefresh()}>
              {t.weather.update}
            </button>
          </div>
          {status ? <p className="form-status">{status}</p> : null}
        </section>

        <section className="weather-stage" aria-label={t.weather.animationAria(condition)}>
          <WeatherMotion condition={condition} />
        </section>
      </div>

      <div className="weather-metrics">
        <article>
          <span>{t.weather.condition}</span>
          <strong>{weather ? weatherCodeLabel(weather.code, t) : t.weather.waiting}</strong>
        </article>
        <article>
          <span>{t.weather.humidity}</span>
          <strong>{weather ? `${weather.humidity}%` : "--"}</strong>
        </article>
        <article>
          <span>{t.weather.wind}</span>
          <strong>{weather ? `${Math.round(weather.windSpeed)} km/h` : "--"}</strong>
        </article>
        <article>
          <span>{t.weather.updated}</span>
          <strong>{weather?.updatedAt ?? t.weather.notYet}</strong>
        </article>
      </div>
    </div>
  );
}
