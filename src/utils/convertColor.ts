export const hexToHsl = (hexCode: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexCode);
  if (!result) {
    return `0 0% 0%`;
  }

  let r = parseInt(result[1] as string, 16);
  let g = parseInt(result[2] as string, 16);
  let b = parseInt(result[3] as string, 16);

  r /= 255, g /= 255, b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h: number, s: number, l: number = (max + min) / 2;
  h = s = 0; // achromatic

  if (max != min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }

    h /= 6;
  }

  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);

  return `${h} ${s}% ${l}%`;
}

export const hslToHex = (hslCss: string): string => {
  const regexp = /hsl\(\s*(\d+)\s*,\s*(\d+(?:\.\d+)?%)\s*,\s*(\d+(?:\.\d+)?%)\)/g;
  const hsl = regexp.exec(hslCss)?.slice(1);
  
  if(!hsl){
    return "#000000";
  }

  let h = parseInt(hsl[0] as string);
  let s = parseInt(hsl[1]?.split("%")[0] as string);
  let l = parseInt(hsl[2]?.split("%")[0] as string);

  h /= 360;
  s /= 100;
  l /= 100;

  let r: number, g: number, b: number;
  r = g = b = l;

  if (s !== 0) {
    const hue2rgb = function (p: number, q: number, t: number) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = function (x: number) {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

export const getDarkerShades = (hsl: string) => {
  const hslValues = hsl.split(' ');
  const l = parseInt((hslValues[2] as string).split('%')[0] as string);
  // Calculate the darker shades of the color
  const shade200 = `${hslValues[0] as string} ${hslValues[1] as string} ${(l * 0.9).toFixed(0)}%`;
  const shade300 = `${hslValues[0] as string} ${hslValues[1] as string} ${(l * 0.8).toFixed(0)}%`;

  return [shade200, shade300];
}