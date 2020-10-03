// 绘制的逻辑
const canvasInsert = (ctx, el, noClear) => {
  const { canvas } = ctx
  if (!noClear) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  if (el.tag == 'piechart') {
    let {
      data,
      r,
      x,
      y
    } = el;
    let total = data.reduce((memo, current) => memo + current.count, 0);
    let start = 0,
      end = 0;
    data.forEach(item => {
      end += item.count / total * 360;
      drawPieChart(ctx, start, end, item.color, x, y, r);
      drawPieChartText(ctx, item.name, (start + end) / 2, x, y, r);
      start = end;
    });
  }
  el.childs && el.childs.forEach(child => draw(child, true));
}

/**
 * 度数转弧度
 * @param {*} n 
 */
const d2a = (n) => {
  return n * Math.PI / 180;
}

/**
 * 画扇形
 * @param {*} start 
 * @param {*} end 
 * @param {*} color 
 * @param {*} cx 
 * @param {*} cy 
 * @param {*} r 
 */
const drawPieChart = (ctx, start, end, color, cx, cy, r) => {
  let x = cx + Math.cos(d2a(start)) * r;
  let y = cy + Math.sin(d2a(start)) * r;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(x, y);
  ctx.arc(cx, cy, r, d2a(start), d2a(end), false);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.closePath();
}

/**
 * 画扇形上的文字
 * @param {*} val 
 * @param {*} position 
 * @param {*} cx 
 * @param {*} cy 
 * @param {*} r 
 */
const drawPieChartText = (ctx, val, position, cx, cy, r) => {
  ctx.beginPath();
  let x = cx + Math.cos(d2a(position)) * r / 1.25 - 20;
  let y = cy + Math.sin(d2a(position)) * r / 1.25;
  ctx.fillStyle = '#000';
  ctx.font = '20px 微软雅黑';
  ctx.fillText(val, x, y);
  ctx.closePath();
}

export { canvasInsert }