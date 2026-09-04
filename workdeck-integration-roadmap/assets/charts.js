(function () {
  var s = getComputedStyle(document.documentElement);
  var accent = s.getPropertyValue('--accent').trim();
  var accent2 = s.getPropertyValue('--accent2').trim();
  var ink = s.getPropertyValue('--ink').trim();
  var muted = s.getPropertyValue('--muted').trim();
  var rule = s.getPropertyValue('--rule').trim();

  var phases = [
    { n: '前端原型 / UI', v: 1 },
    { n: '桌面程序化（Electron）', v: 1 },
    { n: '本地数据（SQLite + FTS5）', v: 0.9 },
    { n: '软件 / 文件 / 素材管理', v: 0.6 },
    { n: 'AgentService 适配层', v: 0.4 },
    { n: '接入 Hermes / GLM', v: 0.2 },
    { n: '「帮我准备工作」', v: 0.05 },
    { n: '行为学习 / 习惯模式', v: 0 }
  ];

  var chart = echarts.init(document.getElementById('chart-phase'), null, { renderer: 'svg' });
  chart.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      appendToBody: true,
      valueFormatter: function (v) { return Math.round(v * 100) + '%'; }
    },
    grid: { left: 128, right: 52, top: 16, bottom: 24 },
    xAxis: {
      type: 'value',
      max: 1,
      axisLabel: { color: muted, formatter: function (v) { return Math.round(v * 100) + '%'; } },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'category',
      data: phases.map(function (p) { return p.n; }),
      axisLabel: { color: ink, fontSize: 12 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    series: [{
      type: 'bar',
      data: phases.map(function (p) { return p.v; }),
      barWidth: 18,
      itemStyle: {
        color: function (params) { return params.value >= 0.9 ? accent : accent2; },
        borderRadius: [0, 6, 6, 0]
      },
      label: {
        show: true,
        position: 'right',
        color: muted,
        formatter: function (p) { return Math.round(p.value * 100) + '%'; }
      }
    }]
  });

  window.addEventListener('resize', function () { chart.resize(); });
})();