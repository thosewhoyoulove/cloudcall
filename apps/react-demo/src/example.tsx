import { CloudCallProvider } from '@cloudcall/react';
import type { CloudCallSDK } from '@cloudcall/core';
export function ReactHost({ sdk }: { sdk: CloudCallSDK }) {
  return (
    <CloudCallProvider sdk={sdk}>
      <p>SDK is mounted independently from the host UI.</p>
    </CloudCallProvider>
  );
}
