const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const r = size * 0.22;

  // Rounded green background
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = "#25D366";
  ctx.fill();

  const s = size / 64;

  // White speech bubble
  ctx.beginPath();
  ctx.fillStyle = "#ffffff";
  const cx = 32 * s, cy = 30 * s, rad = 20 * s;
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  // Tail
  ctx.beginPath();
  ctx.moveTo(12 * s, 52 * s);
  ctx.lineTo(15 * s, 40 * s);
  ctx.lineTo(24 * s, 46 * s);
  ctx.closePath();
  ctx.fill();

  // Green lightning bolt
  ctx.beginPath();
  ctx.fillStyle = "#25D366";
  ctx.moveTo(35 * s, 20 * s);
  ctx.lineTo(25 * s, 33 * s);
  ctx.lineTo(31 * s, 33 * s);
  ctx.lineTo(29 * s, 44 * s);
  ctx.lineTo(39 * s, 31 * s);
  ctx.lineTo(33 * s, 31 * s);
  ctx.closePath();
  ctx.fill();

  return canvas.toBuffer("image/png");
}

const iconsDir = path.join(__dirname, "icons");
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

[16, 48, 128].forEach(size => {
  const buf = drawIcon(size);
  const file = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(file, buf);
  console.log(`Generated ${file}`);
});
