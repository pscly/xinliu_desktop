import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('<App />', () => {
  it('可以在不依赖 Electron 的情况下渲染', () => {
    render(<App />);

    expect(screen.getByTestId('titlebar-minimize')).toBeTruthy();
    expect(screen.getByTestId('titlebar-maximize')).toBeTruthy();
    expect(screen.getByTestId('titlebar-close')).toBeTruthy();

    expect(screen.getByTestId('triptych-left')).toBeTruthy();
    expect(screen.getByTestId('triptych-middle')).toBeTruthy();
    expect(screen.getByTestId('triptych-right')).toBeTruthy();

    expect(screen.getByTestId('nav-notes')).toBeTruthy();
    expect(screen.getByTestId('nav-collections')).toBeTruthy();
    expect(screen.getByTestId('nav-todo')).toBeTruthy();
    expect(screen.getByTestId('nav-settings')).toBeTruthy();
    expect(screen.getByTestId('nav-conflicts')).toBeTruthy();

    fireEvent.click(screen.getByTestId('titlebar-minimize'));
    fireEvent.click(screen.getByTestId('titlebar-maximize'));
    fireEvent.click(screen.getByTestId('titlebar-close'));

    fireEvent.click(screen.getByTestId('nav-settings'));
    expect(screen.getAllByText('设置').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('nav-conflicts'));
    expect(screen.getAllByText('冲突').length).toBeGreaterThan(0);
  });
});
