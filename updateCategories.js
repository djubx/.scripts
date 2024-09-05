require('dotenv').config({ path: '../.env' });
const { createClient } = require('@sanity/client');
const categoriesData = require('./categories.json');


const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
  });
  
  async function updateCategories() {
    try {
      const existingCategories = await client.fetch('*[_type == "category"]');
  
      for (const [index, categoryData] of categoriesData["Flutter Packages"].entries()) {
        const [categoryName] = Object.keys(categoryData);
        const existingCategory = existingCategories.find(c => c.name === categoryName);
  
        if (existingCategory) {
          await client
            .patch(existingCategory._id)
            .set({ order: index })
            .commit();
          console.log(`Updated category: ${categoryName}`);
        } else {
          const newCategory = await client.create({
            _type: 'category',
            name: categoryName,
            order: index
          });
          console.log(`Created new category: ${newCategory.name}`);
        }
      }
      console.log('All categories updated successfully');
    } catch (error) {
      console.error('Error updating categories:', error);
    }
  }
  
  async function updateSubCategories() {
    try {
      const existingCategories = await client.fetch('*[_type == "category"]');
      const existingSubCategories = await client.fetch('*[_type == "subCategory"]');
  
      for (const categoryData of categoriesData["Flutter Packages"]) {
        const [categoryName, subCategories] = Object.entries(categoryData)[0];
        const category = existingCategories.find(c => c.name === categoryName);
  
        if (!category) {
          console.error(`Category not found: ${categoryName}`);
          continue;
        }
  
        for (const subCategoryData of subCategories) {
          const [subCategoryName, subCategoryInfo] = Object.entries(subCategoryData)[0];
          const slug = subCategoryName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+$/, '');
  
          const existingSubCategory = existingSubCategories.find(sc => sc.name === subCategoryName);
  
          if (existingSubCategory) {
            await client
              .patch(existingSubCategory._id)
              .set({
                description: subCategoryInfo.description,
                packagesCount: subCategoryInfo.packages.length,
                slug: {
                    _type: 'slug',
                    current: slug
                },
                category: {
                  _type: 'reference',
                  _ref: category._id
                }
              })
              .commit();
            console.log(`Updated subcategory: ${subCategoryName} with slug: ${slug}`);
          } else {
            const newSubCategory = await client.create({
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
            });
            console.log(`Created new subcategory: ${newSubCategory.name}`);
          }
        }
      }
      console.log('All subcategories updated successfully');
    } catch (error) {
      console.error('Error updating subcategories:', error);
    }
  }
  
  module.exports = {
    updateCategories,
    updateSubCategories
  };