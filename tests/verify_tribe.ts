
// Logic snippet from targeting.ts
function filterByTribe(pool: any[], tribe: string) {
    return pool.filter(c => {
        if (Array.isArray(c?.tribes) && c.tribes.includes(tribe)) return true;
        if ((c as any).tribe === tribe) return true;
        return false;
    });
}

// Mock cards
const c1 = { name: "Puppet", tribes: ["Puppetry"], tribe: "Puppetry" };
const c2 = { name: "Ancient Artifact", tribes: ["Artifact"], tribe: "Artifact" };
const c3 = { name: "Puppet Room", tribe: "Puppetry" }; // Legacy style
const c4 = { name: "No Tribe" };

const pool = [c1, c2, c3, c4];
const res = filterByTribe(pool, "Puppetry");

console.log("Filtered Puppetry:", res.map(c => c.name));

if (res.length === 2 && res.includes(c1) && res.includes(c3)) {
    console.log("SUCCESS: Tribe filtering works for both array and legacy string.");
} else {
    console.error("FAILURE: Tribe filtering incorrect.");
    process.exit(1);
}
