interface KuromojiDictionaryToken {
  surface_form: string
  reading?: string
  basic_form?: string
  pos?: string
  word_position?: number
}
interface KuromojiTokenizer { tokenize(text: string): KuromojiDictionaryToken[] }
interface KuromojiBuilder { build(callback: (error: Error | null, tokenizer: KuromojiTokenizer) => void): void }
declare const kuromoji: { builder(options: { dicPath: string }): KuromojiBuilder }
export default kuromoji
