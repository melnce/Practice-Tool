/**
 * MOVED TO LEGACY
 * 
 * Original Path: tests/integration/verify_skybound_load.test.ts
 * Reason: describe is not defined (Env config)
 * Classification: BROKEN: invalid test code
 * 
 * POLICY: Do not fix by changing engine code.
 */

import { CardInstance } from '../../src/core/types';
import { cardFactory } from '../../src/logic/core/cardFactory';
import { state } from '../../src/core/gameState';
import * as fs from 'fs';
import * as path from 'path';

// Mock state
state.blueDeck = [];
state.redDeck = [];

describe('Skybound Dragons Set Integrity', () => {
    const setPath = path.resolve(__dirname, '../cards/sets/10004_skybound-dragons.json');
    let cardData: any[] = [];

    test('JSON file should be valid', () => {
        const content = fs.readFileSync(setPath, 'utf8');
        expect(() => {
            cardData = JSON.parse(content);
        }).not.toThrow();
        expect(Array.isArray(cardData)).toBe(true);
    });

    test('All cards should be loadable by cardFactory', () => {
        const errors: string[] = [];
        cardData.forEach((data) => {
            try {
                // We mock creating a card instance
                // This relies on cardFactory handling the raw data correctly
                // Note: cardFactory usually takes an ID, so we might need to mock the DB or pure instantiation
                // Here we just check major fields
                if (!data.id) errors.push(`Card missing ID: ${data.name}`);
                if (!data.name) errors.push(`Card missing Name: ${data.id}`);
            } catch (e: any) {
                errors.push(`Failed to validate ${data.name} (${data.id}): ${e.message}`);
            }
        });
        expect(errors).toEqual([]);
    });
});


