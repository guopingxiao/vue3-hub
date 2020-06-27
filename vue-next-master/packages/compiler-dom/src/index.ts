import {
  baseCompile,
  baseParse,
  CompilerOptions,
  CodegenResult,
  ParserOptions,
  RootNode,
  noopDirectiveTransform,
  NodeTransform,
  DirectiveTransform
} from '@vue/compiler-core'
import { parserOptions } from './parserOptions'
import { transformStyle } from './transforms/transformStyle'
import { transformVHtml } from './transforms/vHtml'
import { transformVText } from './transforms/vText'
import { transformModel } from './transforms/vModel'
import { transformOn } from './transforms/vOn'
import { transformShow } from './transforms/vShow'
import { warnTransitionChildren } from './transforms/warnTransitionChildren'
import { stringifyStatic } from './transforms/stringifyStatic'
import { extend } from '@vue/shared'

export { parserOptions }

export const DOMNodeTransforms: NodeTransform[] = [
  transformStyle,
  ...(__DEV__ ? [warnTransitionChildren] : [])
]

export const DOMDirectiveTransforms: Record<string, DirectiveTransform> = {
  cloak: noopDirectiveTransform,
  html: transformVHtml,
  text: transformVText,
  model: transformModel, // override compiler-core
  on: transformOn, // override compiler-core
  show: transformShow
}
// compiler-dom 和compiler-core分开，可以在各个平台去实现自己的compiler-dom
export function compile(
  template: string,
  options: CompilerOptions = {}
): CodegenResult {
  // 返回浏览器的实现，其他平台的实现可以在这里返回具体的CodegenResult，比如小程序的compiler就是自己的逻辑
  return baseCompile(
    template,
    extend({}, parserOptions, options, {
      nodeTransforms: [...DOMNodeTransforms, ...(options.nodeTransforms || [])],
      directiveTransforms: extend(
        {},
        DOMDirectiveTransforms,
        options.directiveTransforms || {}
      ),
      transformHoist: __BROWSER__ ? null : stringifyStatic // 如何做静态标记的， 多个静态内容会打成一个字符串，提高性能；
    })
  )
}

export function parse(template: string, options: ParserOptions = {}): RootNode {
  return baseParse(template, extend({}, parserOptions, options))
}

export * from './runtimeHelpers'
export { transformStyle } from './transforms/transformStyle'
export { createDOMCompilerError, DOMErrorCodes } from './errors'
export * from '@vue/compiler-core'
