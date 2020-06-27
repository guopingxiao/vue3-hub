const activeReactiveEffectStack = []
const targetMap = new WeakMap()
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