import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { App } from './app';

describe('App', () => {
  it('should expose the root app component', () => {
    expect(App).toBeTruthy();
  });
});
