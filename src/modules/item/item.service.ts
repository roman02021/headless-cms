import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EntityManager } from '@mikro-orm/postgresql';
import { User } from 'src/types/user';

import { Collection } from '../collection/entities/collection.entity';
import { RelationsService } from '../../relations/relations.service';

@Injectable()
export class ItemsService {
  constructor(
    private readonly em: EntityManager,
    private readonly relationsService: RelationsService,
  ) {}
  async createItem(
    collection: string,
    attributes: Record<string, any>,
    user: User,
  ) {
    try {
      const knex = this.em.getKnex();

      const collectionMeta = await knex('cms_collections').where(
        'name',
        collection,
      );

      if (collectionMeta.length === 0) {
        return new HttpException(
          `Collection named ${collection} does not exist`,
          HttpStatus.NOT_FOUND,
        );
      }

      await knex.transaction(async (trx) => {
        const collectionAttributes = await trx('cms_attributes').where(
          'collection_id',
          collectionMeta[0].id,
        );

        const itemId = await trx(collection)
          .insert({
            created_by: user.id,
            collection_id: collectionMeta[0].id,
          })
          .returning('id');

        for (const collectionAttribute of collectionAttributes) {
          for (const attribute in attributes) {
            if (collectionAttribute.name === attribute) {
              if (collectionAttribute.type === 'relation') {
                if (collectionAttribute.relation_type === 'oneToOne') {
                } else if (collectionAttribute.relation_type === 'oneToMany') {
                  if (Array.isArray(attributes[attribute])) {
                    for (const foreginKey of attributes[attribute]) {
                      await trx(collectionAttribute.referenced_table)
                        .where(
                          collectionAttribute.referenced_column,
                          foreginKey,
                        )
                        .update({
                          [`${collection}_${collectionAttribute.referenced_column}`]:
                            itemId[0].id,
                        });
                    }
                  } else {
                    await trx(collectionAttribute.referenced_table)
                      .where(
                        collectionAttribute.referenced_column,
                        attributes[attribute],
                      )
                      .update({
                        [`${collection}_${collectionAttribute.referenced_column}`]:
                          itemId[0].id,
                      });
                  }
                  delete attributes[attribute];
                } else if (collectionAttribute.relation_type === 'manyToMany') {
                  //TODO
                }
              } else if (collectionAttribute.type === 'file') {
                if (
                  attributes[collectionAttribute.name] === '' ||
                  attributes[collectionAttribute.name] === 0
                ) {
                  attributes[`${collectionAttribute.name}`] = null;
                }
              }
            }
          }
        }

        await trx(collection)
          .where('id', itemId[0].id)
          .update({
            ...attributes,
          });
      });

      return {
        message: `Created new ${collection}`,
      };
    } catch (error) {
      console.log(error);
      return new HttpException(
        'Something went wrong.',
        HttpStatus.BAD_REQUEST,
        {
          cause: error,
        },
      );
    }
  }
  async updateItem(
    collection: string,
    id: number,
    attributes: Record<string, any>,
  ) {
    try {
      const knex = this.em.getKnex();

      const collectionMeta = await knex('cms_collections').where(
        'name',
        collection,
      );

      if (collectionMeta.length === 0) {
        return new HttpException(
          `Collection named ${collection} does not exist`,
          HttpStatus.NOT_FOUND,
        );
      }

      const item = await knex(collection).where('id', id);

      if (item.length === 0) {
        return new HttpException(
          `Item with id ${id} was not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      await knex.transaction(async (trx) => {
        const collectionAttributes = await trx('cms_attributes').where(
          'collection_id',
          collectionMeta[0].id,
        );

        const item = await trx(collection).where('id', id);

        for (const collectionAttribute of collectionAttributes) {
          for (const attribute in attributes) {
            if (collectionAttribute.name === attribute) {
              if (collectionAttribute.type === 'relation') {
                if (collectionAttribute.relation_type === 'oneToOne') {
                } else if (collectionAttribute.relation_type === 'oneToMany') {
                  if (attributes[attribute]) {
                    if (Array.isArray(attributes[attribute])) {
                      await this.relationsService.updateMultipleOneToManyRelations(
                        trx,
                        collectionAttribute.referenced_table,
                        collectionAttribute.referenced_column,
                        collection,
                        item[0].id,
                        attributes[attribute],
                      );
                    } else {
                      await this.relationsService.updateSingleOneToManyRelation(
                        trx,
                        collectionAttribute.referenced_table,
                        collectionAttribute.referenced_column,
                        collection,
                        item[0].id,
                        attributes[attribute],
                      );
                    }
                  }

                  delete attributes[attribute];
                } else if (collectionAttribute.relation_type === 'manyToMany') {
                  //TODO
                }
              } else if (collectionAttribute.type === 'file') {
                if (
                  attributes[collectionAttribute.name] === '' ||
                  attributes[collectionAttribute.name] === 0
                ) {
                  attributes[`${collectionAttribute.name}`] = null;
                }
              }
            }
          }
        }

        if (Object.keys(attributes).length) {
          await trx(collection)
            .where('id', item[0].id)
            .update({
              ...attributes,
            });
        }
      });

      return {
        message: `Item ${item[0].id}`,
      };
    } catch (error) {
      console.log(error);
      return new HttpException(
        'Something went wrong.',
        HttpStatus.BAD_REQUEST,
        {
          cause: error,
        },
      );
    }
  }
  async getItem(collection: string, id: number, relationsToPopulate: string[]) {
    try {
      const knex = this.em.getKnex();

      const item = await knex(collection).where('id', id);

      return item;
    } catch (error) {
      return new HttpException(
        'Something went wrong.',
        HttpStatus.BAD_REQUEST,
        {
          cause: error,
        },
      );
    }
  }
  async getItems(collection: string, relationsToPopulate: string[]) {
    try {
      const collectionMeta = await this.em.findOneOrFail(
        Collection,
        {
          name: collection,
        },
        {
          failHandler: () => new NotFoundException(),
        },
      );

      const knex = this.em.getKnex();
      const items = await knex.from(collection).select('*');

      await knex.transaction(async (trx) => {
        const collectionAttributes = await trx('cms_attributes').where(
          'collection_id',
          collectionMeta.id,
        );

        const fileAttributes = collectionAttributes.filter(
          (collectionAttribute) => collectionAttribute.type === 'file',
        );

        //pozri ine riesenie okrem promise.all alebo pozri ci je promise.all dobre
        await Promise.all(
          items.map(async (item) => {
            for (const fileAttribute of fileAttributes) {
              if (typeof item[fileAttribute.name] === 'number') {
                const file = await trx('cms_files')
                  .select('*')
                  .where('id', item[fileAttribute.name]);

                //toto zmen asi
                item[fileAttribute.name] = 'files' + file[0].file_path;
              }
            }

            await Promise.all(
              relationsToPopulate.map(async (relation) => {
                console.log(relation, 'opa', collectionMeta.name);
                const relationAttribute = await trx('cms_attributes')
                  .where('collection_id', collectionMeta.id)
                  .andWhere('name', relation)
                  .andWhere('type', 'relation');

                // this.em.map(Attribute, relationAttribute);

                if (relationAttribute.length > 0) {
                  console.log(relationAttribute[0].referenced_table, 'ayo');
                  if (relationAttribute[0].relation_type === 'oneToMany') {
                    const foundRelation = await trx(
                      relationAttribute[0].referenced_table,
                    )
                      .select('*')
                      .where(
                        `${collectionMeta.name}_${relationAttribute[0].referenced_column}`,
                        item.id,
                      );

                    if (foundRelation.length > 0) {
                      item[relation] = foundRelation;
                      delete item[`${relation}_id`];
                    }
                  }
                }

                return item;
              }),
            );
          }),
        );
      });

      console.log(items);

      return items;
    } catch (error) {
      if (error.response) {
        return error.response;
      } else {
        return new HttpException(error, HttpStatus.BAD_REQUEST);
      }
    }
  }
  async deleteItem(collection: string, id: number) {
    try {
      const knex = this.em.getKnex();

      const itemId = await knex(collection).where('id', id).del();

      return itemId;
    } catch (error) {
      return new HttpException(
        'Something went wrong.',
        HttpStatus.BAD_REQUEST,
        {
          cause: error,
        },
      );
    }
  }
}
