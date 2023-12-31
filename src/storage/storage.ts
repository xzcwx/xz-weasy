"use strict";

type MapValue = Map<string | number, any>;
type StorageValue = string | number | object | any[] | MapValue;

interface FmStorage {
  [key: string]: any;

  __type__: string;
  __value__?: unknown;
  __dir__: string[];
}

export interface DynamicStorageConfig {
  key?: string;
  encode?: Function;
  decode?: Function;
}

interface SetConfig {
  beforeStorage?: Function;
  ignore?: boolean;
}

export class DynamicStorage {
  public key;
  public encode;
  public decode;
  private fm: FmStorage = {
    __type__: "",
    __value__: "",
    __dir__: ["__type__", "__value__", "__dir__"]
  };

  constructor(
    readonly Storage: Storage,
    private readonly name: string,
    {key, encode, decode}: DynamicStorageConfig = {}
  ) {
    if (![window.localStorage, window.sessionStorage].includes(Storage)) {
      throw TypeError(`使用${this.constructor.name}类实例LS参数必须要传入Storage类型`);
    }

    this.Storage = Storage;
    this.name = name;
    this.key = key;

    if (encode && decode) {
      this.encode = encode;
      this.decode = decode;
    } else if (encode ?? decode) {
      console.warn("使用编码或解码功能，两者必须同时指定执行体");
    }
  }

  has(key?: string): boolean {
    return this.get(key) !== null;
  }

  get(key?: string): any {
    let storage = this.Storage.getItem(this.getKey(key));
    // 解码存在则使用解码
    this.decode && storage && (storage = this.decode(storage));
    return this.parse(storage);
  }

  set(
    value: StorageValue, key?: string,
    {beforeStorage, ignore = false}: SetConfig = {}
  ) {
    const fkey = this.getKey(key);
    let storage = JSON.stringify(!ignore ? this.load(value) : value);

    // 存储之前钩子
    beforeStorage && beforeStorage(fkey, storage);
    // 存储之前检查
    // 解码存在则使用解码
    this.encode && (storage = this.encode(storage));
    this.Storage.setItem(fkey, storage);
  }

  remove(key?: string) {
    this.Storage.removeItem(this.getKey(key));
  }

  add<T = unknown>(data: T, key?: string) {
    // 解析并获取数据
    const storage = this.get(key);
    if (!storage) {
      return console.warn(`请先使用set方法存储数据`);
    }

    // 根据存储数据源类型处理添加数据
    switch (true) {
      case storage?.constructor === Object:
        Object.assign(storage, data);
        break;
      case storage?.constructor === Map:
        let keyValues: [unknown, unknown][] = [];
        if (data instanceof Map) {
          keyValues = Array.from(data.entries());
        } else {
          keyValues = Object.entries(data as Object);
        }
        for (const [k, v] of keyValues) {
          storage.set(k, v);
        }
        break;
      case Array.isArray(storage):
        storage.push(data);
        break;
      default:
        return console.warn(`很遗憾，所存储的数据类型为${typeof storage}，不支持该方法 `);
    }

    // 转换并存储数据
    this.set(storage, key);
  }

  pop<T = unknown>(index: T, key?: string) {
    // 解析并获取数据
    const storage = this.get(key);
    if (!storage) {
      return console.warn(`请先使用set方法存储数据`);
    }

    // 根据存储数据源类型处理添加数据
    switch (true) {
      case storage?.constructor === Object:
        delete storage[index];
        break;
      case storage?.constructor === Map:
        storage.delete(index);
        break;
      case Array.isArray(storage):
        storage.splice(index, 1);
        break;
      default:
        return console.warn(`很遗憾，所存储的数据类型为${typeof storage}，不支持该方法 `);
    }

    // 转换并存储数据
    this.set(storage, key);
  }

  getKey(key?: string, warn?: boolean) {
    if (!key && this.key) {
      return `${this.name}:${this.key}`;
    }
    if (!key && warn) {
      console.warn(`注意：并没有为${this.constructor.name}生成实例传入默认key！`);
    }
    return `${this.name}:${key}`;
  }

  private transverter(value: StorageValue, ignore = false): FmStorage {
    let storage: FmStorage = {
      ...this.fm,
      __type__: typeof value
    };
    // 特殊存储类型数据解析处理
    switch (true) {
      // Map类型处理
      case value.constructor === Map:
        storage.__type__ = "map";
        for (const [k, v] of (value as MapValue).entries()) {
          storage[k] = v;
        }
        break;

      case value.constructor === Object:
        storage = {...storage, ...(value as Object)};
        break;

      case value.constructor === Array:
        storage.__type__ = "array";
        storage.__value__ = value;
        break;

      default:
        storage.__value__ = value;
    }

    return storage;
  }

  private resolver(source: string, original = false): FmStorage | unknown {
    if (original) {
      return JSON.parse(source) as FmStorage;
    }

    const fStorage = JSON.parse(source);
    const {__type__, __value__, __dir__} = fStorage;

    switch (__type__) {
      case "map":
        const storage = this.removeSpecial(fStorage, __dir__);
        return new Map(Object.entries(storage));

      case "object":
        return this.removeSpecial(fStorage, __dir__);

      default:
        return __value__;
    }
  }

  // 辅助方法：去除内置特殊属性
  removeSpecial(storage: FmStorage, dir: string[]) {
    if (storage.constructor === Object) {
      // 去除内置特殊属性
      for (const inlay of dir) {
        delete storage[inlay];
      }
    }
    return storage;
  }

  load(value: StorageValue) {
    return this.transverter(value);
  }

  parse(source?: string | null) {
    if (!source) {
      return source;
    }
    try {
      return this.resolver(source);
    } catch {
      console.error("Json解析异常");
    }
  }
}
