export function paginate(items, page, size) {
  return items.splice(page * size, size)
}
