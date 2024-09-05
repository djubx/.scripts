const { createClient } = require('@sanity/client');

// Initialize the Sanity client
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
  apiVersion: '2024-08-28', // Use today's date
});

// Function to fetch all packages
async function fetchAllPackages() {
  try {
    const query = '*[_type == "package"]';
    const packages = await client.fetch(query);
    console.log(`Fetched ${packages.length} packages`);
    return packages;
  } catch (error) {
    console.error('Error fetching packages:', error.message);
    throw error;
  }
}

// Function to delete a single package
async function deletePackage(packageId) {
  try {
    await client.delete(packageId);
    console.log(`Deleted package with ID: ${packageId}`);
  } catch (error) {
    console.error(`Error deleting package ${packageId}:`, error.message);
    throw error;
  }
}

// Function to delete all packages
async function deleteAllPackages() {
  try {
    const packages = await fetchAllPackages();
    for (const pkg of packages) {
      await deletePackage(pkg._id);
    }
    console.log('All packages deleted successfully');
  } catch (error) {
    console.error('Error in deleteAllPackages:', error.message);
  }
}

module.exports = {
  deletePackage,
  deleteAllPackages,
  fetchAllPackages
};