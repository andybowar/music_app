# Theme vocabulary v1 (draft)

> **Draft for human review.** An agent drafted this list (task CNT-01). A music leader
> must approve it before it is seeded into production. Edit freely; keep
> `themes-v1.json` and this file in sync.

161 themes, 383 synonyms, in 11 review groups.

## How to read this

- **Theme** is the canonical name stored in `themes.name`. Contributors tag lyric
  sections with it.
- **Synonyms** go in `theme_synonyms` (H-02). Searching a synonym finds songs tagged with
  the theme. For example, `lamb of god` finds songs tagged `lamb`.
- Groups exist only to make review easier. They are not stored and are not in the JSON.

## Rules every entry follows

- Lowercase, trimmed, single spaces, 1 to 60 characters (`themeNameSchema`; DB check
  `name = lower(btrim(name))`).
- Every theme name and synonym is unique across the whole file. No synonym equals
  another theme's name, so one search term never maps to two themes.
- No song lyrics. A few synonyms are well-known titles or phrases (for example
  `great is thy faithfulness`, `amazing grace`) because leaders search by them.

## Questions for the reviewer

1. **Fixture names kept as separate themes.** All 40 theme names in `fixtures/themes.json`
   appear here as themes, unchanged, so dev data and seed data agree. Some of them overlap
   and could be merged before production:
   - `risen` and `resurrection`
   - `forever` and `eternity`
   - `reigns` and `king`
   - `honor` and `glory` (H-02's example says searching "honor" should find "glory"
     songs. That needs either a merge, with `honor` becoming a synonym of `glory`, or
     related-theme expansion in H-02. Synonyms alone can't do it while both are themes.)
   - `rocks cry out` is narrow and could fold into `creation` or `praise`.
2. **Ambiguous synonyms.** `spirit`, `rain`, `oil` and `fruit`
   are broad. Keep them only if leaders really search that way.
3. **Community-specific themes.** `covenant community` is included for People of Praise;
   add others the community uses.
4. **Seasons and liturgy.** These describe when a song is used, not what it says. Keep
   them as themes, or move them to a separate tag later.

## God's character and names

| Theme          | Synonyms                                    |
| -------------- | ------------------------------------------- |
| god the father | abba, father god, heavenly father           |
| holiness       | holy, holy holy holy                        |
| majesty        | majestic, splendor                          |
| glory          | glorious, glory of god                      |
| faithfulness   | faithful, great is thy faithfulness         |
| goodness       | good, goodness of god                       |
| love           | love of god, god's love, unfailing love     |
| mercy          | merciful, compassion                        |
| grace          | amazing grace, unmerited favor              |
| power          | mighty, almighty, strength of god           |
| sovereignty    | sovereign, in control                       |
| justice        | just, righteous judge                       |
| righteousness  | righteous                                   |
| creator        | maker                                       |
| creation       | nature, the earth, all creation             |
| rocks cry out  | stones cry out                              |
| light          | light of the world, darkness to light       |
| refuge         | shelter, hiding place, fortress             |
| rock           | solid rock, cornerstone, firm foundation    |
| shepherd       | good shepherd, the lord is my shepherd      |
| provider       | provision, jehovah jireh                    |
| healer         | jehovah rapha, great physician              |
| trinity        | triune god, father son and spirit           |
| unchanging god | immutable, same yesterday today and forever |
| wonder         | awe, awesome god                            |

## Jesus Christ

| Theme           | Synonyms                                             |
| --------------- | ---------------------------------------------------- |
| jesus           | christ, jesus christ                                 |
| name of jesus   | name above all names, your name, the name            |
| lamb            | lamb of god, lamb that was slain, worthy is the lamb |
| king            | king of kings, lord of lords, kingship               |
| reigns          | reign, reigning, he reigns                           |
| savior          | saviour, redeemer                                    |
| son of god      | only son, beloved son                                |
| incarnation     | word made flesh, emmanuel, immanuel, god with us     |
| the cross       | cross, calvary, crucifixion, old rugged cross        |
| blood of jesus  | the blood, precious blood, washed in the blood       |
| sacrifice       | atonement, offering                                  |
| resurrection    | empty tomb, easter, he is risen                      |
| risen           | risen lord, risen christ                             |
| ascension       | ascended                                             |
| second coming   | return of christ, maranatha, come lord jesus         |
| prince of peace | wonderful counselor, mighty god                      |
| high priest     | intercessor, mediator                                |
| bread of life   | living bread                                         |
| living water    | fountain, streams of living water                    |
| friend of god   | friend, what a friend                                |
| bridegroom      | bride of christ, wedding feast                       |

## Holy Spirit

| Theme               | Synonyms                                    |
| ------------------- | ------------------------------------------- |
| holy spirit         | spirit of god, holy ghost, spirit           |
| fire                | holy fire, refiner's fire                   |
| pentecost           | day of pentecost                            |
| outpouring          | pour out, rain, latter rain                 |
| gifts of the spirit | charismatic gifts, spiritual gifts, tongues |
| fruit of the spirit | fruit                                       |
| breath of god       | breath, breathe, wind of the spirit         |
| anointing           | anointed, oil                               |
| come holy spirit    | veni creator, spirit come                   |

## Worship and response

| Theme         | Synonyms                         |
| ------------- | -------------------------------- |
| praise        | praising, hallelujah, alleluia   |
| worship       | adoration, adore                 |
| thanksgiving  | thanks, gratitude, thankful      |
| celebration   | celebrate, rejoicing, shout      |
| joy           | joyful, gladness                 |
| worthy        | you are worthy, worthiness       |
| honor         | honour, esteem                   |
| blessing      | bless the lord, bless, blessed   |
| singing       | sing, new song, song of praise   |
| dancing       | dance                            |
| lifting hands | raise our hands, hands lifted    |
| bowing down   | kneel, bow down, on my knees     |
| exaltation    | exalt, lift high, be lifted high |
| hosanna       | hosanna in the highest           |
| magnify       | make him known                   |

## Salvation and the gospel

| Theme              | Synonyms                                          |
| ------------------ | ------------------------------------------------- |
| salvation          | saved, born again                                 |
| redemption         | redeemed, ransom, bought with a price             |
| forgiveness        | forgiven, pardon, sins forgiven                   |
| freedom            | free, chains broken, liberty                      |
| deliverance        | delivered, rescue, rescued                        |
| repentance         | repent, turning back, return to god               |
| confession         | confess                                           |
| new life           | new creation, made new, transformation            |
| adoption           | children of god, sons and daughters, child of god |
| identity in christ | who i am, identity                                |
| justification      | justified, declared righteous                     |
| sanctification     | holy living, purity, pure heart                   |
| gospel             | good news                                         |
| victory            | triumph, overcome, overcomer                      |

## Christian life

| Theme             | Synonyms                                    |
| ----------------- | ------------------------------------------- |
| faith             | believe, belief, trust in god               |
| trust             | trusting, reliance                          |
| surrender         | i surrender, yielding, lay it down          |
| obedience         | obey                                        |
| discipleship      | follow, follow jesus, following christ      |
| consecration      | dedication, set apart                       |
| devotion          | devoted, my all, first love                 |
| seeking god       | seek, seek his face, pursuit                |
| longing           | thirst, hunger for god, desire              |
| intimacy          | closeness, draw near, nearness              |
| presence          | presence of god, in your presence, dwelling |
| waiting           | wait on the lord, patience                  |
| prayer            | pray, petition, intercession                |
| humility          | humble, meekness                            |
| servanthood       | serving, service, servant                   |
| perseverance      | endurance, steadfast, keep going            |
| courage           | bold, boldness, fearless                    |
| spiritual warfare | battle, armor of god, the enemy             |
| wisdom            | understanding, guidance                     |
| word of god       | scripture, the bible, your word             |
| generosity        | giving, stewardship                         |

## Comfort and trials

| Theme          | Synonyms                             |
| -------------- | ------------------------------------ |
| hope           | hopeful, anchor                      |
| peace          | shalom, be still, calm               |
| comfort        | consolation, comforter               |
| healing        | heal, healed                         |
| restoration    | restore, renewal, renew              |
| strength       | strengthen, strong, renewed strength |
| rest           | sabbath rest, weary                  |
| suffering      | pain, trials, affliction             |
| lament         | mourning, grief, sorrow              |
| fear not       | do not be afraid, anxiety            |
| protection     | safety, under his wings, shield      |
| brokenness     | broken, contrite heart               |
| storms         | storm, waves, stormy sea             |
| wilderness     | desert, dry season                   |
| god's promises | promise, promises, covenant          |
| assurance      | confidence, blessed assurance        |

## Church and community

| Theme              | Synonyms                                              |
| ------------------ | ----------------------------------------------------- |
| unity              | one body, together, oneness                           |
| community          | fellowship, brotherhood, sisterhood                   |
| the church         | church, body of christ, people of god                 |
| family             | household, home                                       |
| covenant community | covenant love, life together                          |
| love one another   | love your neighbor, brotherly love                    |
| mission            | missions, go into all the world, great commission     |
| evangelism         | witness, share the gospel, testimony                  |
| serving the poor   | the least of these, social justice, care for the poor |
| nations            | all nations, every tribe and tongue, the world        |
| revival            | awakening, revive us                                  |
| children           | kids, next generation, generations                    |

## Sacraments and liturgy

| Theme            | Synonyms                                                       |
| ---------------- | -------------------------------------------------------------- |
| communion        | lord's supper, eucharist, table of the lord, breaking of bread |
| baptism          | baptized, water baptism                                        |
| call to worship  | opening, gathering, come let us worship                        |
| sending          | benediction, go in peace, commission                           |
| offertory        | offering song                                                  |
| doxology         | praise god from whom all blessings flow                        |
| creed            | we believe, statement of faith                                 |
| child dedication | infant dedication, dedication of a child                       |
| marriage         | wedding, covenant marriage                                     |
| funeral          | memorial, homegoing                                            |

## Church year and seasons

| Theme       | Synonyms                               |
| ----------- | -------------------------------------- |
| advent      | waiting for messiah, o come            |
| christmas   | nativity, birth of jesus, noel         |
| epiphany    | magi, wise men                         |
| lent        | ash wednesday, fasting                 |
| palm sunday | triumphal entry                        |
| holy week   | passion, good friday, maundy thursday  |
| harvest     | seedtime and harvest, harvest festival |
| new day     | morning, new morning, dawn             |
| evening     | night, end of day                      |
| new year    | new beginnings, fresh start            |

## Eternity and the kingdom

| Theme          | Synonyms                                 |
| -------------- | ---------------------------------------- |
| heaven         | paradise, heavenly home                  |
| eternity       | eternal, everlasting, eternal life       |
| forever        | for all time, evermore                   |
| kingdom of god | your kingdom come, kingdom, kingdom come |
| new jerusalem  | holy city, zion                          |
| throne room    | the throne, before the throne            |
| angels         | heavenly host, seraphim, cherubim        |
| judgment       | day of the lord, final judgment          |
