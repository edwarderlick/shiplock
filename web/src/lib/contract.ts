import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';

export const client = createClient({
    chain: studioDevnet,
});
