import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLock(lockPath, fn) {
  mkdirSync(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        return fn();
      } finally {
        closeSync(fd);
        try {
          unlinkSync(lockPath);
        } catch {
          // Another waiter may already have observed a stale lock.
        }
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 5_000) unlinkSync(lockPath);
      } catch {
        // Lock disappeared between the collision and the stale check.
      }
      sleep(20);
    }
  }
  throw new Error('Shared store lock timed out');
}

export function createMemoryStore() {
  const records = new Map();
  return {
    kind: 'memory',
    ready() {
      return true;
    },
    get(key) {
      return records.get(key);
    },
    set(key, value) {
      records.set(key, value);
    },
    delete(key) {
      records.delete(key);
    },
    update(key, updater) {
      const next = updater(records.get(key));
      if (next === undefined) records.delete(key);
      else records.set(key, next);
      return next;
    },
    sweep(isExpired) {
      for (const [key, value] of records) if (isExpired(value)) records.delete(key);
    },
    size() {
      return records.size;
    },
  };
}

export function createFileStore(filePath) {
  const lockPath = `${filePath}.lock`;
  const read = () => {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch (error) {
      if (error?.code === 'ENOENT') return {};
      throw error;
    }
  };
  const write = (data) => {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(data));
    renameSync(temporary, filePath);
  };
  const mutate = (mutator) =>
    withLock(lockPath, () => {
      const data = read();
      const result = mutator(data);
      write(data);
      return result;
    });
  return {
    kind: 'file',
    ready() {
      try {
        mutate((data) => data);
        return true;
      } catch {
        return false;
      }
    },
    get(key) {
      return withLock(lockPath, () => read()[key]);
    },
    set(key, value) {
      mutate((data) => {
        data[key] = value;
      });
    },
    delete(key) {
      mutate((data) => {
        delete data[key];
      });
    },
    update(key, updater) {
      return mutate((data) => {
        const next = updater(data[key]);
        if (next === undefined) delete data[key];
        else data[key] = next;
        return next;
      });
    },
    sweep(isExpired) {
      mutate((data) => {
        for (const key of Object.keys(data)) if (isExpired(data[key])) delete data[key];
      });
    },
    size() {
      return withLock(lockPath, () => Object.keys(read()).length);
    },
  };
}
