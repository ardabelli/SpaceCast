// Uygulamanın arkasındaki uzay: nebula, iki katman piksel yıldız (yavaş kayma), yanıp sönen ışıltılar,
// ara sıra kayan yıldız ve uzakta halkalı bir gezegen. Yalnızca transform/opacity animasyonları (pil dostu).

import { memo } from 'react';
import { planet, stars } from '../textures.ts';

export const Space = memo(function Space() {
  const far = stars(256, 140, 3);
  const near = stars(320, 26, 9, true);
  const glint = stars(400, 10, 21, true);
  const world = planet(44, '#6b5bd6', '#d07ac2', 5);
  const moon = planet(14, '#8d95b8', '#5c6283', 8, false);
  return (
    <div className="space" aria-hidden="true">
      <div className="nebula" />
      <div className="starlayer far" style={{ backgroundImage: `url(${far})` }} />
      <div className="starlayer near" style={{ backgroundImage: `url(${near})` }} />
      <div className="starlayer glint" style={{ backgroundImage: `url(${glint})` }} />
      <img className="planet" src={world} alt="" />
      <img className="moon" src={moon} alt="" />
      <i className="shooting s1" />
      <i className="shooting s2" />
    </div>
  );
});
