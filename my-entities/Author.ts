import { Entity, ManyToOne, Opt, PrimaryKey, Property } from '@mikro-orm/core';
import { CmsUsers } from './CmsUsers';

@Entity()
export class Author {

  @PrimaryKey()
  id!: number;

  @ManyToOne({ entity: () => CmsUsers, fieldName: 'created_by', nullable: true })
  createdBy?: CmsUsers;

  @Property({ nullable: true })
  collectionId?: number;

  @Property({ type: 'Date', length: 6, defaultRaw: `CURRENT_TIMESTAMP` })
  createdAt!: Date & Opt;

  @Property({ type: 'Date', length: 6, defaultRaw: `CURRENT_TIMESTAMP` })
  updatedAt!: Date & Opt;

  @Property({ length: 255, nullable: true })
  name?: string;

  @Property({ nullable: true })
  age?: number;

  @Property({ nullable: true })
  blogId?: number;

}
