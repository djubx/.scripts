require('dotenv').config({ path: '../.env' });
const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
});

async function deleteAllCategories() {
  try {
    // Fetch all existing categories
    const existingCategories = await client.fetch('*[_type == "category"]');
    
    // Delete each category
    for (const category of existingCategories) {
      await client.delete(category._id);
      console.log(`Deleted category: ${category.name}`);
    }
    
    console.log('All existing categories deleted');
  } catch (error) {
    console.error('Error deleting categories:', error);
  }
}

async function deleteAllSubCategories() {
  try {
    const existingSubCategories = await client.fetch('*[_type == "subCategory"]');
    for (const subCategory of existingSubCategories) {
      await client.delete(subCategory._id);
      console.log(`Deleted subcategory: ${subCategory.name}`);
    }
    console.log('All existing subcategories deleted');
  } catch (error) {
    console.error('Error deleting subcategories:', error);
  }
}

module.exports = {
  deleteAllCategories,
  deleteAllSubCategories
};