import type { CSSProperties } from "react";

/**
 * WeatherMotion — pure CSS atmospheric scene.
 *
 * The animation choreography (sun pulse / cloud drift / rain / snow / wind)
 * is preserved from the original implementation; the colors are re-skinned
 * to the Atelier Noir palette in globals.css via the weather-theme-* classes
 * and the .weather-motion container.
 */
export function WeatherMotion({ condition, compact = false }: { condition: WeatherCondition; compact?: boolean }) {
  const customProps = (index: number, prefix: string) => ({ [`${prefix}-index`]: index }) as CSSProperties;

  if (condition === "rain") {
    return (
      <div className={`weather-motion rain-motion ${compact ? "is-compact" : ""}`} aria-hidden="true">
        <span className="motion-cloud cloud-one" />
        <span className="motion-cloud cloud-two" />
        {Array.from({ length: 11 }, (_, index) => (
          <span key={index} className="rain-drop" style={customProps(index, "--drop")} />
        ))}
        <span className="rain-puddle" />
      </div>
    );
  }

  if (condition === "snow") {
    return (
      <div className={`weather-motion snow-motion ${compact ? "is-compact" : ""}`} aria-hidden="true">
        <span className="motion-cloud cloud-one" />
        {Array.from({ length: 13 }, (_, index) => (
          <span key={index} className="snow-flake" style={customProps(index, "--flake")} />
        ))}
        <span className="snow-bank" />
      </div>
    );
  }

  if (condition === "wind") {
    return (
      <div className={`weather-motion wind-motion ${compact ? "is-compact" : ""}`} aria-hidden="true">
        <span className="motion-cloud cloud-one" />
        <span className="motion-cloud cloud-two" />
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className="wind-line" style={customProps(index, "--wind")} />
        ))}
        <span className="wind-tree">
          <span />
        </span>
      </div>
    );
  }

  return (
    <div className={`weather-motion sun-motion ${compact ? "is-compact" : ""}`} aria-hidden="true">
      <span className="sun-core" />
      <span className="sun-ring" />
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} className="sun-ray" style={customProps(index, "--ray")} />
      ))}
    </div>
  );
}

export type WeatherCondition = "sunny" | "rain" | "snow" | "wind";
