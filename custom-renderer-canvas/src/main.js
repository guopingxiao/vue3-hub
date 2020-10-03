import {
  createRenderer
} from 'vue'

import CanvasApp from './CanvasApp.vue'
import { canvasInsert } from './insert'

const nodeOps = {
  insert: (child, parent, anchor) => {
    // 我们重写了insert逻辑，因为在我们canvasApp中不存在实际dom插入操作
    // 这里面只需要将元素之间的父子关系保存一下即可
    child.parent = parent;

    if (!parent.childs) {
      parent.childs = [child]
    } else {
      parent.childs.push(child);
    }

    // 只有canvas有nodeType，这里就是开始绘制内容到canvas
    if (parent.nodeType == 1) {
      canvasInsert(ctx, child);
      // 如果子元素上附加了事件，我们给canvas添加监听器
      if (child.onClick) {
        ctx.canvas.addEventListener('click', () => {
          child.onClick();
          setTimeout(() => {
            canvasInsert(ctx, child)
          }, 0);
        })
      }
    }
  },
  remove: child => {},
  createElement: (tag, isSVG, is) => { // 创建元素时由于没有需要创建的dom元素，只需返回当前元素数据对象
    return {
      tag
    }
  },
  createText: text => {},
  createComment: text => {},
  setText: (node, text) => {},
  setElementText: (el, text) => {},
  parentNode: node => {},
  nextSibling: node => {},
  querySelector: selector => {},
  setScopeId(el, id) {},
  cloneNode(el) {},
  insertStaticContent(content, parent, anchor, isSVG) {},
  patchProp(el, key, prevValue, nextValue) {
    el[key] = nextValue;
  },
};

// 创建一个渲染器
let renderer = createRenderer(nodeOps);

// 保存画布和其上下文
let ctx;
let canvas;

// 扩展mount，首先创建一个画布元素
function createCanvasApp(App) {
  const app = renderer.createApp(App);
  const mount = app.mount;
  app.mount = function (selector) {
    canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.querySelector(selector).appendChild(canvas);
    ctx = canvas.getContext('2d');
    mount(canvas);
  }
  return app
}

createCanvasApp(CanvasApp).mount('#app')

