import React from 'react';
import { render } from '@testing-library/react-native';
import { TamaguiProvider } from 'tamagui';
import config from '../tamagui.config';
import SearchScreen from '../app/(tabs)/index';

// Mock Alert to avoid warnings
jest.mock('react-native/Libraries/Alert/Alert', () => ({
    alert: jest.fn(),
}));

const Providers = ({ children }: { children: React.ReactNode }) => {
    return <TamaguiProvider config={config} defaultTheme="dark">{children}</TamaguiProvider>;
};

describe('HomeScreen', () => {
    it('renders the Search Input and Search Button correctly', () => {
        const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper: Providers });

        const searchInput = getByPlaceholderText('Search for an item (e.g. iPhone 15)');
        expect(searchInput).toBeTruthy();

        const searchButton = getByText('Search');
        expect(searchButton).toBeTruthy();
    });
});
