const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
let state = [], index = 0, changes = []
let editor = { enabled: true, locale: 'zh', onText: (field, value) => changes.push({ field, value }) }
const React = { createContext: value => ({ value }), useContext: () => editor,
  useState: value => { const i = index++; if (!(i in state)) state[i] = value; return [state[i], value => { state[i] = value }] },
  useRef: value => { const i = index++; return state[i] ||= { current: value } } }
const jsx = (type, props) => ({ type, props })
const source = fs.readFileSync(path.join(__dirname, '../src/components/ActivityCanvasEditor.tsx'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const mod = { exports: {} }
new Function('require', 'module', 'exports', code)(name => {
  if (name === 'react') return React
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
  throw new Error(name)
}, mod, mod.exports)
function render(children) { index = 0; return mod.exports.ActivityInlineText({ as: 'h1', field: 'greeting', children }).props }
let props = render('原文')
assert.equal(props.contentEditable, 'plaintext-only')
props.onFocus()
props.onBlur({ currentTarget: { innerText: '原文' } })
assert.equal(changes.length, 0, 'Focus alone must not create a custom override')
props.onFocus()
props = render('输入后的草稿')
assert.equal(props.children, '原文', 'Parent draft echoes must not replace DOM text and reset the caret while focused')
props.onInput({ currentTarget: { innerText: '正在输入' } })
assert.deepEqual(changes.pop(), { field: 'greeting', value: '正在输入' })
props.onCompositionStart()
props.onInput({ currentTarget: { innerText: '未完成拼音' } })
assert.equal(changes.length, 0, 'Do not publish incomplete IME composition')
props.onCompositionEnd({ currentTarget: { innerText: '中文完成' } })
assert.equal(changes.pop().value, '中文完成')
props.onBlur({ currentTarget: { innerText: '中文完成' } })
props = render('中文完成')
assert.equal(props.children, '中文完成')
props.onInput({ currentTarget: { innerText: 'x'.repeat(501) } })
assert.equal(changes.pop().value.length, 500)
editor = { ...editor, enabled: false }; changes = []
props = render('公开页面')
assert.equal(props.contentEditable, undefined)
assert.equal(props.role, undefined)
props.onInput({ currentTarget: { innerText: '不能修改' } })
assert.equal(changes.length, 0)
console.log('PASS inline canvas: plaintext only, caret preserved on draft echo, IME composition, blur commit, text limit and read-only public rendering.')

editor = { ...editor, enabled: true, link: null }
assert.equal(mod.exports.ActivityInlineLinkEditor({linkKey: 'instagram:test'}), null, 'No link input before an icon is selected')
editor.link = {key: 'instagram:test', original: 'https://www.instagram.com/test/', url: 'https://www.instagram.com/test/'}
assert.equal(mod.exports.ActivityInlineLinkEditor({linkKey: 'tiktok:test'}), null, 'Other icons must not show the selected link input')
assert.equal(mod.exports.ActivityInlineLinkEditor({linkKey: 'instagram:test'}).props.link.key, 'instagram:test')
editor.enabled = false
assert.equal(mod.exports.ActivityInlineLinkEditor({linkKey: 'instagram:test'}), null, 'Experience preview must hide link inputs')
console.log('PASS link input visibility: selected icon only, one active account, hidden before selection and outside edit mode.')

// Exercise the real link input component through its rendered event handlers.
let opened = []
global.window = { open: (...args) => opened.push(args) }
editor = { ...editor, enabled: true, onLink: () => {} }
state = []; index = 0
const inputComponent = mod.exports.ActivityInlineLinkEditor({linkKey: 'instagram:test'})
function linkRender() { index = 0; return inputComponent.type(inputComponent.props) }
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  const children = node.props?.children
  for (const child of Array.isArray(children) ? children : [children]) { const found = find(child, predicate); if (found) return found }
  return null
}
let tree = linkRender()
find(tree, n => n.type === 'textarea').props.onChange({target:{value:'https://www.instagram.com/new_destination/'}})
tree = linkRender()
let open = find(tree, n => n.type === 'button' && n.props['aria-label'])
assert.equal(open.props.disabled, false)
open.props.onClick()
assert.deepEqual(opened.pop(), ['https://www.instagram.com/new_destination/', '_blank', 'noopener,noreferrer'], 'Open the latest input, not the saved link')
for (const value of ['javascript:alert(1)', 'not a link', 'https://user:password@example.test/']) {
  find(tree, n => n.type === 'textarea').props.onChange({target:{value}})
  tree = linkRender(); open = find(tree, n => n.type === 'button' && n.props['aria-label'])
  assert.equal(open.props.disabled, true); open.props.onClick(); assert.equal(opened.length, 0)
}
delete global.window
console.log('PASS link suffix button: latest draft destination, safe new window, invalid URLs disabled and never opened.')
