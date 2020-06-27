# 浅析Vue3中的响应式原理

请在此前阅读[Vue Composition API](https://vue-composition-api-rfc.netlify.app/)内容，熟悉一下api。

## 实现响应式的方式

- `defineProperty`
- `Proxy`

众所周知在Vue3中使用了ES6提供的`ProxyAPI`取代了之前`defineProperty`来实现对数据的侦测.

**为啥使用Proxy?**

我们知道在Vue2对于监测数组的变化是通过重写了数组的原型来完成的，这么做的原因是:

不会对数组每个元素都监听，提升了性能.(`arr[index] = newValue`是不会触发试图更新的, 这点不是因为`defineProperty`的局限性，而是出于性能考量的)
`defineProperty`不能检测到数组长度的变化，准确的说是通过改变`length`而增加的长度不能监测到(`arr.length = newLength`也不会)。

**同样对于对象，由于`defineProperty`的局限性，Vue2是不能检测对象属性的添加或删除的。**

```js
function defineReactive(data, key, val) {
    Object.defineProperty(data, key, {
        enumerable: true,
        configurable: true,
        get() {
            console.log(`get key: ${key} val: ${val}`)
            return val
        },
        set(newVal) {
            console.log(`set key: ${key} val: ${newVal}`)
            val = newVal
        }
    })
}
function observe(data) {
    Object.keys(data).forEach((key)=> {
        defineReactive(data, key, data[key])
    })
}
let test = [1, 2, 3]
observe(test)
console.log(test[1])   // get key: 1 val: 2
test[1] = 2       // set key: 1 val: 2
test.length = 1   // 操作是完成的,但是没有触发set
console.log(test.length) // 输出1，但是也没有触发get
```
## 实现响应式前的一些小细节

相对于`defineProperty`，`Proxy`无疑更加强大，可以代理数组，并且提供了多种属性访问的方法`traps(get, set, has, deleteProperty)`等等。
```js
let data = [1,2,3]
let p = new Proxy(data, {
    get(target, key, receiver) {
        // target 目标对象，这里即data
        console.log('get value:', key)
        return target[key]
    },
    set(target, key, value, receiver) {
        // receiver 最初被调用的对象。通常是proxy本身，但handler的set方法也有可能在原型链上或以其他方式被间接地调用（因此不一定是proxy本身）。
        // 比如，假设有一段代码执行 obj.name = "jen"，obj不是一个proxy且自身不含name属性，但它的原型链上有一个proxy，那么那个proxy的set拦截函数会被调用，此时obj会作为receiver参数传进来。
        console.log('set value:', key, value)
        target[key] = value
        return true // 在严格模式下，若set方法返回false，则会抛出一个 TypeError 异常。
    }
})
p.length = 4   // set value: length 4
console.log(data)   // [1, 2, 3, empty]
```
但是对于数组的一次操作可能会触发多次`get/set`,主要原因自然是改变数组的内部key的数量了(即对数组进行插入删除之类的操作),导致的连锁反应。
```js
// data : [1,2,3]
p.push(1)
// get value: push
// get value: length
// set value: 3 1
// set value: length 4
// data : [1,2,3]
p.shift()
// get value: shift
// get value: length
// get value: 0
// get value: 1
// set value: 0 2
// get value: 2
// set value: 1 3
// set value: length 2
```
同时Proxy是仅**代理一层**的，对于深层对象，也是需要开发者自行实现的，此外对于对象的添加是可以 `set` traps侦测到的，删除则需要使用 `deleteProperty` traps。

```js
let data = {a:1, b:{c:'c'}, d:[1,2,3]}
let p = new Proxy(data, {
    ....同上
})
console.log(p.a)
console.log(p.b.c)
console.log(p.d)
console.log(p.d[0])
p.e = 'e'  // 这里可以看到给对象添加一个属性也依然可以侦测到变化
// get value: a
// 1
// get value: b
// c
// get value: d
// [1, 2, 3]
// get value: d
// 1
// set value: e e
```

还有一件事，对于一些简单的`get/set`操作，我们在traps中使用`target[key]`，`target[key] = value`是可以达到我们的需求的，但是对于一些复杂的如`delete`，`in`这类操作这样实现就不够优雅了，而ES6提供了`Reflect` API,且与Proxy的traps一一对应,用来代替 Object 的默认行为。所以我们先将之前的代码改造一下:

```js
let p = new Proxy(data, {
    get(target, key, receiver) {
        console.log('get value:', key)
        const res = Reflect.get(target, key, receiver)
        return res
    },
    set(target, key, value, receiver) {
        console.log('set value:', key, value)
        // 如果赋值成功，则返回true
        const res = Reflect.set(target, key, value, receiver)
        return res
    }
})
```

## 实现mini版的vue响应式reactive

### 明确目标

我们最终实现的效果应该如下一样:
```js
const a = reactive({ b: 0 })
effect(() => {
    console.log(a.b)
})  //effect在传入时就会自动执行一次
a.b ++ // 这时会打印 1
```

### 实现思路

熟悉Vue2的同学都知道Vue2的响应式是在get中收集依赖, 在set中触发依赖,Vue3想必也不例外,按照这个思路我们的实现步骤如下:

1. 在触发`get`时收集`effect`函数传入的回调，这里我们称这个回调为`ReactiveEffect`
2. 在`set`、`deleteProperty`...时触发所有的`ReactiveEffect`

下面我们看下具体的实现步骤

### `reactive`的简单实现
第一步，我们先来简单实现一个可以对对象增删改查侦测的函数

在set的实现中，我们将对象的set分为两类：**新增key和更改key的value**。通过`hasOwnProperty`判断这个对象是否含有这个属性，不存在存在则是添加属性，存在则判断新value和旧value是否相同，不同才需要触发log执行。

这里的reactive函数我们记为V1版本。
```js
// reactive.v1.js
const hasOwn = (val,key)=>{
    const res = Object.prototype.hasOwnProperty.call(val, key)
    console.log(val,key,res)
    return res
} 

function reactive(data){
    return new Proxy(data, {
        get(target, key, receiver) {
            console.log('get value:', key)
            const res = Reflect.get(target, key, receiver)
            return res
        },
        set(target, key, value, receiver) {
            const hadKey = hasOwn(target, key)
            const oldValue = target[key]
            const res = Reflect.set(target, key, value, receiver)
            if (!hadKey) {
                console.log('set value:ADD', key, value)
            } else if (value !== oldValue) {
                console.log('set value:SET', key, value)
            } 
            return res
        },
        deleteProperty(target, key){
            const hadKey = hasOwn(target, key)
            const oldValue = target[key]
            const res = Reflect.deleteProperty(target, key)
            if (hadKey) {
                console.log('set value:DELETE', key)
            }
            return res
        }
    })
}
```
**依赖收集**

在Vue3中针对所有的被监听的对象，存在一张关系表`targetMap`, key为target，value为另一张关系表`depsMap`。

`depsMap`的`key`为`target`的每个`key`，`value`为由`effect`函数传入的参数的Set集。
```js
type Dep = Set<ReactiveEffect>
type KeyToDepMap = Map<string | symbol, Dep>
const targetMap = new WeakMap<any, KeyToDepMap>()
// targetMap大概结构如下所示
//    target | depsMap
//      obj  |   key  |  Dep 
//               k1   |  effect1,effect2...
//               k2   |  effect3,effect4...
//      obj2 |   key  |  Dep 
//               k1   |  effect1,effect2...
//               k2   |  effect3,effect4...
//
```

同时我们还需要收集effect函数的回调`ReactiveEffect`,当`ReactiveEffect`内有已被监听的对象get触发get时，便需要一个存储`ReactiveEffect`的地方。这里使用一个数组记录:
```js
const activeReactiveEffectStack: ReactiveEffect[] = []
```
effect函数实现如下:
```
function run(effect,fn,args){
    try {
        activeReactiveEffectStack.push(effect)
        return fn(...args)   //执行fn以收集依赖
    } finally {
        activeReactiveEffectStack.pop()
    }
}
function effect(fn,lazy=false){
    const effect1 = function (...args){
        return run(effect1, fn, args)
    }
    if (!lazy){
        effect1()
    }
    return effect1
}
```
**track跟踪器**

由于get时的依赖收集:
```js
function track(target,type,key){
    const effect = activeReactiveEffectStack[activeReactiveEffectStack.length - 1]
    if (effect) {
        let depsMap = targetMap.get(target)
        if (depsMap === void 0) {
            targetMap.set(target, (depsMap = new Map()))
        }
        let dep = depsMap.get(key)
        if (dep === void 0) {
            depsMap.set(key, (dep = new Set()))
        }
        if (!dep.has(effect)) {
            dep.add(effect)
        }
    }
}

```
**trigger触发器**

key变化(set,delete...)时触发,获取这个key所对应的所有的`ReactiveEffect`,然后执行:
```js
function trigger(target,type,key){
    console.log(`set value:${type}`, key)
    const depsMap = targetMap.get(target)
    if (depsMap === void 0) {
        return
    }
    // 获取已存在的Dep Set执行
    const dep = depsMap.get(key)
    if (dep !== void 0) {
        dep.forEach(effect => {
            effect()
        })
    }
}
```
reactive函数如下:
```js
function reactive(target){
   const observed = new Proxy(target, {
       get(target, key, receiver) {
           const res = Reflect.get(target, key, receiver)
           track(target,"GET",key)
           return res
       },
       set(target, key, value, receiver) {
           const hadKey = hasOwn(target, key)
           const oldValue = target[key]
           const res = Reflect.set(target, key, value, receiver)
           if (!hadKey) {
               trigger(target,"ADD",key)
           } else if (value !== oldValue) {
               trigger(target,"SET",key)
           } 
           return res
       },
       deleteProperty(target, key){
           const hadKey = hasOwn(target, key)
           const oldValue = target[key]
           const res = Reflect.deleteProperty(target, key)
           if (hadKey) {
               console.log('set value:DELETE', key)
           }
           return res
       }
   })
   if (!targetMap.has(target)) {
       targetMap.set(target, new Map())
   }
   return observed
}
```
**深层监听**

通常我们都会想到通过`递归`的方式,对每个key判读啊是否为对象来进行监听，在Vue3中:
```js
function get(target, key, receiver) {
    const res = Reflect.get(target, key, receiver)
    track(target, "GET", key)
    return isObject(res) ? reactive(res) : res //递归
}
```

Vue3中，这里做了性能的优化，做了一层lazy access的操作，这样只有在访问到深层的对象时才会去做代理。
> 注意
此时我们所有的`ReactiveEffect`都是和key绑定的, 也就是说, 在`ReactiveEffect`函数中, 我们必须get一次确定的某个key, 否则在set时是没有`ReactiveEffect`可以触发的, 举个列子:

```js
let data = {a:1,b:{c:'c'}}
let p = reactive(data)
effect(()=>{console.log(p)})
p.a = 3 
```
上面这种情况是不会打印p的.

```js
let data = {a:1,b:{c:'c'}}
let p = reactive(data)
effect(()=>{console.log(p.a)})
p.a = 3  // 3
```

这种情况才会执行`()=>{console.log(p.a)`,打印3

### 数组类型的问题

但对于数组进行一些操作时，执行起来会有一点小不同,我们来使用V1版本的reactive函数来监听一个数组`p = reactive([1,2,3])`,并分别对p进行操作看看结果:
```js
p.push(1)
// set value:ADD 3 1
p.unshift(1)
// set value:ADD 3 3
// set value:SET 2 2
// set value:SET 1 1
p.splice(0,0,2)
// set value:ADD 3 3
// set value:SET 2 2
// set value:SET 1 1
// set value:SET 0 2
p[3] = 4
// set value:ADD 3 4
--------
p,pop()
// set value:DELETE 2
// set value:SET length 2
p.shift()
// set value:SET 0 2
// set value:SET 1 3
// set value:DELETE 2
// set value:SET length 2
delete p[0]
// set value:DELETE 0
// 这里p的length依然是三
```
可以发现当我们对数组添加元素时，对于length的SET并不会触发(), 而删除元素时才会触发length的SET,同时对数组的一次操作触发了多次log。

这里在我们对数组添加操作时就会出现一个问题，我们使用`p.push(1)`,操作的index是3，上面的列子我们知道在`effect`函数中我们必须get这个3，才会把ReactiveEffect给绑定上去,但那时候是很没有3这个index的,所以就会导致没有办法执行ReactiveEffect。
Vue3中的处理是在trigger中添加一段代码:
```js
function trigger(target,type,key){
    console.log(`set value:${type}`, key)
    const depsMap = targetMap.get(target)
    if (depsMap === void 0) {
        return
    }
    const effects = new Set()
    if (key !== void 0) {
        const depSet = depsMap.get(key)
        if (depSet !== void 0) {
            depSet.forEach(effect => {
                effects.add(effect)
            })
        }
    }
    // 就是这里啦，(这里做了一些更改)
    if (type === "ADD" || type === "DELETE") {
        if(Array.isArray(target)){
            const iterationKey = 'length'
            const depSet = depsMap.get(iterationKey)
            if (depSet !== void 0) {
                depSet.forEach(effect => {
                    effects.add(effect)
                })
            }
        }
    }
    // 获取已存在的Dep Set执行
    effects.forEach(effect=>effect())
}
```
当监听的target为数组时,操作为ADD或者DELETE时,触发的ReactiveEffect为绑在数组length上的,看下面一段代码:
```js
let data = { foo: 'foo', ary: [1, 2, 3] }
let r = reactive(data)
effect(()=>console.log(r.ary.length))
r.ary.unshift(1)  // 4
```
**验证**

我们来拿Vue3的代码执行一下看一下是否和我们的一样;

yarn build 之后引入reactivity.js
```js
const { reactive, effect } = VueObserver
let data = { foo: 'foo', ary: [1, 2, 3] }
let r = reactive(data)
effect(()=>console.log(r.ary.length))
r.ary.unshift(1)  // 4
--------------
const { reactive, effect } = VueObserver
let data = { foo: 'foo', ary: [1, 2, 3] }
let r = reactive(data)
effect(()=>console.log(r.ary))
r.ary.unshift(1)  // 没有打印
-------
const { reactive, effect } = VueObserver
let data = { foo: 'foo', ary: [1, 2, 3] }
let r = reactive(data)
effect(()=>console.log(r))
r.foo = 1   // 啥也没打印
--------
const { reactive, effect } = VueObserver
let data = { foo: 'foo', ary: [1, 2, 3] }
let r = reactive(data)
effect(()=>console.log(r.foo))
r.foo = 1   // 1
------
const { reactive,effect } = VueObserver
let data = { foo: 'foo', ary: [1, 2, 3] }
let r = reactive(data)
effect(()=>console.log(r.ary.join()))
r.ary.unshift(1)
// 1,2,3
// 1,2,3,3
// 1,2,2,3
// 1,1,2,3
//多次打印，证明多次触发
```
可以发现我们的代码和Vue3表现是一致的。
测试的代码都在这个里面➡️代码
## 总结
到此我们应该算是对Vue3中的响应式有一个了解了

```js
// 完整的代码
const activeReactiveEffectStack = [] // 收集effect
const targetMap = new WeakMap()  // 全局的
const isObject = (val) => val !== null && typeof val === 'object'
const hasOwn = (val,key)=>{
    const res = Object.prototype.hasOwnProperty.call(val, key)
    //console.log(val,key,res)
    return res
}

function run(effect,fn,args){
    try {
        activeReactiveEffectStack.push(effect)
        return fn(...args)   //执行fn以收集依赖
    } finally {
        activeReactiveEffectStack.pop()
    }
}

function effect(fn,lazy=false){
    const effect1 = function (...args){
        return run(effect1, fn, args)
    }
    if (!lazy){
        effect1()
    }
    return effect1
}

function track(target,type,key){
    const effect = activeReactiveEffectStack[activeReactiveEffectStack.length - 1]
    if (effect) {
        let depsMap = targetMap.get(target)
        if (depsMap === void 0) {
            targetMap.set(target, (depsMap = new Map()))
        }
        let dep = depsMap.get(key)
        if (dep === void 0) {
            depsMap.set(key, (dep = new Set()))
        }
        if (!dep.has(effect)) {
            console.log(key,effect)
            dep.add(effect)
        }
    }
}

function trigger(target,type,key){
    console.log(`set value:${type}`, key)
    const depsMap = targetMap.get(target)
    if (depsMap === void 0) {
        return
    }
    const effects = new Set()
    if (key !== void 0) {
        const depSet = depsMap.get(key)
        if (depSet !== void 0) {
            depSet.forEach(effect => {
                effects.add(effect)
            })
        }
    }
    if (type === "ADD" || type === "DELETE") {
        if(Array.isArray(target)){
            const iterationKey = 'length'
            const depSet = depsMap.get(iterationKey)
            if (depSet !== void 0) {
                depSet.forEach(effect => {
                    effects.add(effect)
                })
            }
        }
    }
    // 获取已存在的Dep Set执行
    effects.forEach(effect=>effect())
}


function reactive(target){
    const observed = new Proxy(target, {
        get(target, key, receiver) {
            const res = Reflect.get(target, key, receiver)
            track(target,"GET",key)
            return isObject(res) ? reactive(res): res
        },
        set(target, key, value, receiver) {
            const hadKey = hasOwn(target, key)
            const oldValue = target[key]
            const res = Reflect.set(target, key, value, receiver)
            if (!hadKey) {
                trigger(target,"ADD",key)
            } else if (value !== oldValue) {
                trigger(target,"SET",key)
            }
            return res
        },
        deleteProperty(target, key){
            const hadKey = hasOwn(target, key)
            const oldValue = target[key]
            const res = Reflect.deleteProperty(target, key)
            if (hadKey) {
                console.log('set value:DELETE', key)
            }
            return res
        }
    })
    if (!targetMap.has(target)) {
        targetMap.set(target, new Map())
    }
    return observed
}
```