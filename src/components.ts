import { defineComponents } from '@iwsdk/core';
import {
  DioramaStage,
  RealWorldTarget,
  StageProp,
  VaultTwinObject,
} from './components/realvault-components.js';

export default defineComponents([
  RealWorldTarget,
  VaultTwinObject,
  DioramaStage,
  StageProp,
]);
