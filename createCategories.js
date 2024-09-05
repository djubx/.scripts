const { createClient } = require('@sanity/client');
const categoriesData = require('./categories.json');

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
});

async function createCategories() {
  const categories = categoriesData["Flutter Packages"].map((category, index) => {
    const [name] = Object.keys(category);
    return {
      _type: 'category',
      name: name,
      order: index
    };
  });

  console.log(categories);

  try {
    // Fetch existing categories
    const existingCategories = await client.fetch('*[_type == "category"]');

    for (const category of categories) {
      // Check if the category already exists
      const existingCategory = existingCategories.find(c => c.name === category.name);
      if (existingCategory) {
        console.log(`Category already exists: ${category.name}`);
      } else {
        const result = await client.create(category);
        console.log(`Created category: ${result.name}`);
      }
    }
    console.log('All categories processed successfully');
  } catch (error) {
    console.error('Error creating categories:', error);
  }
}

async function createSubCategories() {
  try {
    const categories = await client.fetch('*[_type == "category"]');
    // Fetch existing subcategories
    const existingSubCategories = await client.fetch('*[_type == "subCategory"]');
    
    for (const categoryData of categoriesData["Flutter Packages"]) {
      const [categoryName, subCategories] = Object.entries(categoryData)[0];
      const category = categories.find(c => c.name === categoryName);
      
      if (!category) {
        console.error(`Category not found: ${categoryName}`);
        continue;
      }

      for (const subCategoryData of subCategories) {
        const [subCategoryName, subCategoryInfo] = Object.entries(subCategoryData)[0];
        const slug = subCategoryName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+$/, '');
        
        // Check if the subcategory already exists
        const existingSubCategory = existingSubCategories.find(sc => sc.name === subCategoryName);
        if (existingSubCategory) {
          console.log(`Subcategory already exists: ${subCategoryName}`);
          continue;
        }

        const subCategory = {
          _type: 'subCategory',
          name: subCategoryName,
          slug: {
            _type: 'slug',
            current: slug
          },
          description: subCategoryInfo.description,
          tags: [],
          category: {
            _type: 'reference',
            _ref: category._id
          },
          packagesCount: subCategoryInfo.packages.length
        };

        console.log(subCategory);

        const result = await client.create(subCategory);
        console.log(`Created subcategory: ${result.name}`);
      }
    }
    console.log('All subcategories processed successfully');
  } catch (error) {
    console.error('Error creating subcategories:', error);
  }
}

module.exports = {
  createCategories,
  createSubCategories
};