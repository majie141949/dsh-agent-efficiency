import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from './total.mjs'
import { paginate } from './paginate.mjs'
import { slug } from './slug.mjs'

test('总价按百分比折扣后取整', () => assert.equal(total([{ price: 199, quantity: 3 }], 15), 507))
test('零数量不计入总价', () => assert.equal(total([{ price: 100, quantity: 0 }]), 0))
test('空购物车总价为零', () => assert.equal(total([], 20), 0))
test('非法价格数量和折扣被拒绝', () => {
  assert.throws(() => total([{ price: -1, quantity: 1 }]), RangeError)
  assert.throws(() => total([{ price: 1, quantity: -1 }]), RangeError)
  assert.throws(() => total([], 101), RangeError)
  assert.throws(() => total([], -1), RangeError)
})
test('第一页从第一个元素开始', () => assert.deepEqual(paginate([1, 2, 3, 4, 5], 1, 2), [1, 2]))
test('分页不修改输入', () => {
  const items = [1, 2, 3, 4, 5]
  assert.deepEqual(paginate(items, 2, 2), [3, 4])
  assert.deepEqual(items, [1, 2, 3, 4, 5])
})
test('越界页为空', () => assert.deepEqual(paginate([1], 3, 2), []))
test('页码和页大小必须为正整数', () => {
  for (const [page, size] of [[0, 1], [1, 0], [-1, 2], [1.5, 2], [1, 2.5]]) {
    assert.throws(() => paginate([], page, size), RangeError)
  }
})
test('标题标准化空白和大小写', () => assert.equal(slug('  Hello   WORLD  '), 'hello-world'))
test('制表和换行也属于空白', () => assert.equal(slug(' A\tB\nC '), 'a-b-c'))
test('全空白标题为空', () => assert.equal(slug('  \n\t '), ''))
test('已有连字符保留', () => assert.equal(slug('A-B'), 'a-b'))
