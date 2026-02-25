import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('<App />', () => {
  it('可以在不依赖 Electron 的情况下渲染', () => {
    render(<App />);

    expect(screen.getByText('心流')).toBeTruthy();
    expect(screen.getByText('运行环境')).toBeTruthy();
  });
});
