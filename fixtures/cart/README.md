修复三个模块，保留现有导出接口。

- `total(items, discount)`：单价单位为分，先求数量加权总价，再应用百分比折扣并四舍五入为整数分；数量可以为零；数量或单价为负、折扣不在 0–100 时抛出 RangeError。
- `paginate(items, page, size)`：页码从 1 开始，不修改原数组；page、size 必须为正整数，否则抛出 RangeError；越界页返回空数组。
- `slug(text)`：去掉首尾空白，转小写，把连续空白合并成一个连字符，空字符串返回空字符串。

运行 `node --test checks.test.mjs` 验收。不要修改测试或本说明。
