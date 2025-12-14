
import './setup';
console.log("Attempting to import effects index...");
try {
    await import('../src/logic/core/effects/index.js');
    console.log("Successfully imported effects index.");
} catch (e) {
    console.error("CRASH IMPORTING EFFECTS:");
    console.error(e);
}
