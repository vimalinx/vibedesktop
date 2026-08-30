import type { I18nMessages } from "@/lib/i18n";
import {
  desktopWeatherStatusText,
  weatherCodeLabel,
  weatherConditionFromReading,
  type WeatherCondition,
  type WeatherReading
} from "@/lib/desktop-helpers";
import { WeatherMotion } from "./weather-motion";

export function DesktopWeatherWidget({
  t,
  city,
  weather,
  status
}: {
  t: I18nMessages;
  city: string;
  weather: WeatherReading | null;
  status: string;
}) {
  const condition: WeatherCondition = weatherConditionFromReading(weather);
  const temperature = weather ? `${Math.round(weather.temperature)}°` : "--°";
  const place = weather?.place || city || t.builtins.weather.title;
  const detail = weather
    ? t.weather.widgetDetail(weatherCodeLabel(weather.code, t), weather.windSpeed)
    : desktopWeatherStatusText(status, t);

  return (
    <div className={`desktop-weather-card weather-theme-${condition}`}>
      <div className="desktop-weather-copy">
        <span>{t.builtins.weather.title}</span>
        <strong>{temperature}</strong>
        <p>{place}</p>
        <small>{detail}</small>
      </div>
      <WeatherMotion condition={condition} compact />
      <div className="desktop-weather-stats" aria-hidden="true">
        <span>
          <small>{t.weather.humidity}</small>
          <strong>{weather ? `${weather.humidity}%` : "--"}</strong>
        </span>
        <span>
          <small>{t.weather.wind}</small>
          <strong>{weather ? `${Math.round(weather.windSpeed)}` : "--"}</strong>
        </span>
      </div>
    </div>
  );
}
