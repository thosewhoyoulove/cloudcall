import { defineComponent } from 'vue';
import { useCloudCall } from '@cloudcall/vue';
import type { CloudCallSDK } from '@cloudcall/core';
export const createVueHost = (sdk: CloudCallSDK) =>
  defineComponent({
    setup() {
      return useCloudCall(sdk);
    },
    template: '<p>CloudCall state: {{ state }}</p>',
  });
