// Uygulamanın arkasındaki uzay: nebula, iki katman piksel yıldız (yavaş kayma), yanıp sönen ışıltılar,
// ara sıra kayan yıldız ve uzakta halkalı bir gezegen. Yalnızca transform/opacity animasyonları (pil dostu).

import { memo } from 'react';
import { themeById } from '../spaceThemes.ts';
import { useStore } from '../store.ts';
import { planet, stars } from '../textures.ts';

export const Space = memo(function Space() {
  const theme = themeById(useStore((x) => x.spaceTheme));
  const far = stars(256, theme.id === 'void' ? 220 : 140, 3);
  const near = stars(320, 26, 9, true);
  const glint = stars(400, 10, 21, true);
  const world = planet(44, theme.planet[0], theme.planet[1], 5, theme.id !== 'void');
  const moon = planet(14, theme.moon[0], theme.moon[1], 8, false);
  return (
    <div className="space" aria-hidden="true" style={{ background: theme.base }}>
      <div className="nebula" style={{ background: theme.nebula }} />
      <div className="starlayer far" style={{ backgroundImage: `url(${far})` }} />
      <div className="starlayer near" style={{ backgroundImage: `url(${near})` }} />
      <div className="starlayer glint" style={{ backgroundImage: `url(${glint})` }} />
      <img className="planet" src={world} alt="" style={{ filter: `drop-shadow(0 0 40px ${theme.glow})` }} />
      <img className="moon" src={moon} alt="" />
      <i className="shooting s1" />
      <i className="shooting s2" />
    </div>
  );
});
