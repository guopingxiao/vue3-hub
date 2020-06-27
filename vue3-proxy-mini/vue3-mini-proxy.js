
// 主要是实现三大API: reactive, computed, effect


// Proxy 可以拦截所以的操作 不需要$set
//   支持全部的数据格式， Map
//   懒收集
    // 自带能力
// defineProperty
//   初始化的时候，全部递归完毕
//   数组需要单独拦截
//   对象新增和删除属性，不能拦截，所以需要 $set, $


// 学习源码，最好的方式，先写一个迷你版本的demo，然后去阅读实际的代码， 直接一上来就阅读，头发掉的很快，抽取一个mini版后，再看是如何扩展和丰富的了； 
const baseHandler = {
  get(target, key){
      // Reflect.get更严谨
      // const res = target[key]
      const res = Reflect.get(target, key)
      // 尝试获取值obj.age, 触发了getter
      track(target, key)     // --> 收集了什么依赖呢？ 怎么收集的？， 来看下track 的实现
      return typeof res === 'object' ? reactive(res) : res
  },

  set(target, key, val){
    const info = { oldValue: target[key], newValue:val }
    // Reflect.set
    // target[key] = val
    const res = Reflect.set(target,key,val)

    // @todo 响应式去通知变化 触发执行effect
    trigger(target, key, info)
  }
}

// obj.age+=1
function reactive(target){
  // vue3还需要考虑Map这些对象, 这里只考虑普通对象；
  const observed = new Proxy(target, baseHandler)
  // 返回proxy代理后的对象
  console.log(targetMap)
  return observed
}

/**
 * computed是特殊的effect
 * @param {*} fn 
 */
function computed(fn){
  // 特殊的effect， options为lazy，computed， 另外加一个get value()
  const runner = effect(fn, { computed:true, lazy:true })
  return {
    effect: runner,
    get value(){ // get value返回出去，为啥要 .vaule属性获取
      return runner()
    }
  }
}

/**
 * createReactiveEffect 包装一下传入的fn， 返回回去； 
 * @param {*} fn 
 * @param {*} options 
 */
function effect(fn, options = {}){
  // 依赖函数 
  let e = createReactiveEffect(fn, options)
  // lazy仕computed配置的
  if(!options.lazy){
    // 不是懒执行,直接执行掉， computed是lazy的，第一次不会执行
    e()
  }
  return e
}

/**
 * 构造固定格式的effect, 返回固定格式的对象
 * @param {*} fn 
 * @param {*} options 
 */
function createReactiveEffect(fn, options){
  
  const effect = function effect(...args){
    return run(effect, fn, args)
  }
  // effect的配置
  effect.deps = []
  effect.computed = options.computed
  effect.lazy = options.lazy
  return effect
}

/**
 * 真正执行effect函数
 * @param {*} effect 
 * @param {*} fn 
 * @param {*} args 
 */
function run(effect, fn, args){
  // 执行effect
  // 取出effect 执行
  if(effectStack.indexOf(effect) === -1){
    try{
      effectStack.push(effect) // effectStack收集
      return fn(...args) // 执行effect
    }finally{
      effectStack.pop() // effect执行完毕
    }
  }
}

let effectStack = [] // 存储effect副作用

let targetMap = new WeakMap() //存储target 

// 怎么收集依赖，用一个巨大的map来收集，targetMap, key 为target, value为 depMap
// {
//   target1: {  --> depMap
    // age,name
//     key: [包装之后的effect依赖的函数1，依赖的函数2]
//   }
//   target2:{
//     key2:
//   }
// }
/**
 * 依赖收集
 * @param {*} target 
 * @param {*} key 
 */
function track(target, key){
  // 收集依赖
  const effect = effectStack[effectStack.length - 1] // 获取最新的依赖；没有的话就是undefined
  if(effect){
    let depMap = targetMap.get(target)
    if(depMap === undefined){
      depMap = new Map()
      targetMap.set(target, depMap) // 空的depMap， 构造target的depMap
    }
    let dep = depMap.get(key)
    if(dep === undefined){  // 空的dep， 构造key的dep Set
      dep = new Set()
      depMap.set(key, dep)
    }
    // 容错
    if(!dep.has(effect)){ // 如果dep不包含effect，add到dep
      // 新增依赖
      // 双向存储 方便查找优化, 一个存储在 targetMap.target.key.dep里； 一个存储在effectStack[effect].dep里
      dep.add(effect)
      effect.deps.push(dep) // --> effect 是我们index.html里传入的，他到底是个什么东西？看effect函数的实现，走起
    }
  }
}

/**
 * 依赖触发
 * @param {*} target 
 * @param {*} key 
 * @param {*} info 
 */
function trigger(target, key, info){
  // 数据变化后，通知更新 执行effect
  // 1. 找到依赖
  const depMap = targetMap.get(target)
  if(depMap===undefined){
    return 
  }
  // 分开，普通的effect，和computed又一个优先级
  // effects先执行，computet后执行
  // 因为computed会可能依赖普通的effects
  const effects = new Set()
  const computedRunners = new Set()
  if(key){
    let deps = depMap.get(key)
    deps.forEach(effect=>{
      if(effect.computed){
        computedRunners.add(effect)
      }else{
        effects.add(effect)
      }
    })
    effects.forEach(effect=>effect())
    computedRunners.forEach(computed=>computed())
  }
}